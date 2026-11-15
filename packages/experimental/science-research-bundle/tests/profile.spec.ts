/** The Science Research bundle declares one locked research preset, the loop view, and paths that exist. */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Entry {
  id?: string
  name?: string
  config?: Record<string, unknown> & { plugins?: Entry[] }
  insert?: Entry[]
}

const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  files?: string[]
  dsh?: { bundle?: { patch?: string[] } }
}

const parse = (path: string): Entry[] => yaml.load(readFileSync(resolve(root, path), 'utf8'), { schema: entryListSchema }) as Entry[]
const patch = parse('cordis.patch.yml')
const inserts = patch.flatMap(entry => entry.insert ?? [])
const preset = inserts.find(entry => entry.id === 'preset-research')

/** Every entry in a patch tree: inserts, preset plugin lists, and group configs. */
function entries(list: readonly Entry[]): Entry[] {
  return list.flatMap((entry) => {
    const nested = [...entry.insert ?? [], ...entry.config?.plugins ?? []]
    if (Array.isArray(entry.config)) nested.push(...(entry.config as Entry[]))
    return [entry, ...entries(nested)]
  })
}

/** Every `!!js` expression in a value tree. */
function expressions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(expressions)
  if (typeof value !== 'object' || value === null) return []
  const expression = (value as { __jsExpr?: unknown }).__jsExpr
  return typeof expression === 'string' ? [expression] : Object.values(value).flatMap(expressions)
}

const byId = new Map(entries(patch).map(entry => [entry.id ?? '', entry]))

// oxlint-disable-next-line typescript/no-implied-eval -- reproduces the Loader's `!!js` evaluation over the shipped patch text
const loaderEval = new Function('scope', 'source', 'with (scope) { return eval(source) }') as (scope: object, source: string) => unknown

describe('Science Research bundle', () => {
  it('declares one patch and depends on every plugin it names', () => {
    expect(manifest.dsh?.bundle?.patch).toEqual(['./cordis.patch.yml'])
    const names = new Set(entries(patch).map(entry => entry.name).filter(name => name?.startsWith('@deepseek-ai/')))
    expect(names.size).toBeGreaterThan(20)
    for (const name of names) expect(manifest.dependencies?.[name ?? ''], name).toBe('workspace:*')
  })

  it('locks the profile to the research preset, starts in Full access, and mounts the research loop view', () => {
    expect(patch.find(entry => entry.id === 'agent-preset-registry')?.config).toEqual({ default: 'research', modeSelectionEnabled: false })
    expect(patch.find(entry => entry.id === 'permission')?.config?.defaultPreset).toBe('danger-full-access')
    expect(inserts.find(entry => entry.id === 'research-loop-ui')?.name).toBe('@deepseek-ai/dsh-experimental-client-ui-research-loop')
    expect(preset?.config?.id).toBe('research')
    for (const id of ['persona', 'skill-filesystem', 'tool-skill', 'tool-workflow', 'workflow-ptc', 'mcp-science-agent', 'hooks-science-agent']) {
      expect(byId.has(id), id).toBe(true)
    }
    expect([...byId.keys()].filter(id => id.startsWith('tool-subagent-sa-'))).toEqual([])
    const persona = byId.get('persona')?.config?.prefix
    expect(persona).toContain('{name: "research-loop"')
    expect(persona).toContain('never start a workflow')
  })

  it('resolves every bundle-relative path to a shipped file', () => {
    const scope = { baseUrl: pathToFileURL(resolve(root, 'package.json')).href, process }
    const values = expressions(patch).filter(source => source.includes('createRequire(baseUrl)')).map(source => loaderEval(scope, source))
    const paths = values.filter((value): value is string => typeof value === 'string' && value.startsWith(root))
    expect(paths.length).toBeGreaterThanOrEqual(5)
    for (const path of paths) expect(existsSync(path), path).toBe(true)
    expect(String(values.find(value => typeof value === 'string' && value.startsWith('The science-research bundle root')))).toContain(root.replace(/\/$/u, ''))
  })

  it('publishes the hook config, skills, and synced content', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['cordis.patch.yml', 'hooks/hooks.json', 'skills', 'synced']))
    expect(statSync(resolve(root, 'synced/scripts/mcp-server.sh')).mode & 0o111).not.toBe(0)
    const commands = Object.values((JSON.parse(readFileSync(resolve(root, 'hooks/hooks.json'), 'utf8')) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }).hooks).flat().flatMap(group => group.hooks.map(hook => hook.command))
    expect(commands).toHaveLength(2)
    for (const command of commands) {
      const relative = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/u.exec(command)?.[1] ?? ''
      expect(existsSync(resolve(root, relative)), command).toBe(true)
    }
    for (const name of ['sa-research', 'sa-research-status', 'sa-doctor']) {
      const skill = readFileSync(resolve(root, 'skills', name, 'SKILL.md'), 'utf8')
      expect(skill).toContain(`name: ${name}\n`)
      expect(skill).toContain('user-invocable: true\n')
    }
    const research = readFileSync(resolve(root, 'synced/skills/science-research/SKILL.md'), 'utf8')
    expect(research).toContain('## DeepSeek Harness runtime')
    expect(research).toContain('Mapping rule')
    expect(research).not.toContain('CLAUDE_PLUGIN_ROOT')
  })
})
