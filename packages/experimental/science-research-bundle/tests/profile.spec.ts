/** The bundle declares one locked preset for research and experiments, the role presets, the notebook view, and real paths. */

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
const roles = parse('presets/roles.patch.yml')
const inserts = patch.flatMap(entry => entry.insert ?? [])
const rolePresets = roles.flatMap(entry => entry.insert ?? [])
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
const ROLE_PRESETS = ['sa-engineer', 'sa-hypothesis', 'sa-reporter', 'sa-scout', 'sa-statistician', 'sa-verifier']

// oxlint-disable-next-line typescript/no-implied-eval -- reproduces the Loader's `!!js` evaluation over the shipped patch text
const loaderEval = new Function('scope', 'source', 'with (scope) { return eval(source) }') as (scope: object, source: string) => unknown

describe('Science Research bundle', () => {
  it('declares the main and role patches and depends on every plugin they name', () => {
    expect(manifest.dsh?.bundle?.patch).toEqual(['./cordis.patch.yml', './presets/roles.patch.yml'])
    const names = new Set(entries([...patch, ...roles]).map(entry => entry.name).filter(name => name?.startsWith('@deepseek-ai/')))
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
    const roleTools = [...byId.values()].filter(entry => entry.id?.startsWith('tool-subagent-sa-'))
    expect(roleTools.map(entry => entry.config?.['agentPreset']).sort()).toEqual(ROLE_PRESETS)
    for (const entry of roleTools) expect(entry.config?.['toolName']).toBe(String(entry.config?.['agentPreset']).replace('-', '_'))
    expect(rolePresets.map(entry => entry.config?.['id']).sort()).toEqual(ROLE_PRESETS)
    const writable = rolePresets.filter((entry) => {
      const fs = entries(entry.config?.plugins ?? []).find(plugin => plugin.id === 'tool-fs')?.config ?? {}
      return fs['write'] !== false && fs['edit'] !== false
    }).map(entry => entry.config?.['id'])
    expect(writable).toEqual(['sa-engineer'])
    const persona = byId.get('persona')?.config?.prefix
    expect(persona).toContain('{name: "research-loop"')
    expect(persona).toContain('{name: "science-campaign"')
    expect(persona).toContain('{name: "paper-writing"')
    expect(persona).toContain('**Which loop**')
    expect(persona).toContain('never start a workflow')
    expect(persona).not.toContain('research objectives only')
  })

  it('resolves every bundle-relative path to a shipped file', () => {
    const scope = { baseUrl: pathToFileURL(resolve(root, 'package.json')).href, process }
    const values = expressions([...patch, ...roles]).filter(source => source.includes('createRequire(baseUrl)')).map(source => loaderEval(scope, source))
    const paths = values.filter((value): value is string => typeof value === 'string' && value.startsWith(root))
    expect(paths.length).toBeGreaterThanOrEqual(5 + ROLE_PRESETS.length * 4)
    for (const path of paths) expect(existsSync(path), path).toBe(true)
    expect(String(values.find(value => typeof value === 'string' && value.startsWith('The science-research bundle root')))).toContain(root.replace(/\/$/u, ''))
    const personas = values.filter((value): value is string => typeof value === 'string' && value.startsWith('Runtime mapping (DeepSeek Harness):'))
    expect(personas).toHaveLength(ROLE_PRESETS.length)
    for (const persona of personas) expect(persona).not.toMatch(/\n$/u)
  })

  it('publishes the hook config, skills, and synced content', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['cordis.patch.yml', 'presets/roles.patch.yml', 'hooks/hooks.json', 'skills', 'synced']))
    expect(statSync(resolve(root, 'synced/scripts/mcp-server.sh')).mode & 0o111).not.toBe(0)
    const commands = Object.values((JSON.parse(readFileSync(resolve(root, 'hooks/hooks.json'), 'utf8')) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }).hooks).flat().flatMap(group => group.hooks.map(hook => hook.command))
    expect(commands).toHaveLength(2)
    for (const command of commands) {
      const relative = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/u.exec(command)?.[1] ?? ''
      expect(existsSync(resolve(root, relative)), command).toBe(true)
    }
    for (const name of ['sa-research', 'sa-research-status', 'sa-doctor', 'sa-paper', 'sa-campaign', 'sa-kaggle', 'sa-report', 'sa-round', 'sa-status', 'sa-submit', 'sa-verify']) {
      const skill = readFileSync(resolve(root, 'skills', name, 'SKILL.md'), 'utf8')
      expect(skill).toContain(`name: ${name}\n`)
      expect(skill).toContain('user-invocable: true\n')
    }
    const research = readFileSync(resolve(root, 'synced/skills/science-research/SKILL.md'), 'utf8')
    expect(research).toContain('## DeepSeek Harness runtime')
    expect(research).toContain('Mapping rule')
    expect(research).not.toContain('CLAUDE_PLUGIN_ROOT')
    const paper = readFileSync(resolve(root, 'synced/skills/science-paper/SKILL.md'), 'utf8')
    expect(paper).toContain('## DeepSeek Harness runtime')
    expect(paper).not.toContain('CLAUDE_PLUGIN_ROOT')
    for (const name of ['science-agent', 'science-agent-kaggle']) {
      const campaign = readFileSync(resolve(root, 'synced/skills', name, 'SKILL.md'), 'utf8')
      expect(campaign).toContain('## DeepSeek Harness runtime')
      expect(campaign).toContain('Mapping rule')
      expect(campaign).not.toContain('/science-agent:')
    }
    expect(readFileSync(resolve(root, 'synced/skills/science-agent/SKILL.md'), 'utf8')).toContain('## Which loop')
    expect(readFileSync(resolve(root, 'synced/skills/science-agent-kaggle/SKILL.md'), 'utf8')).toContain('name: "science-campaign"')
    expect(readFileSync(resolve(root, 'skills/sa-research/SKILL.md'), 'utf8')).toContain('`/sa-campaign`')
  })
})
