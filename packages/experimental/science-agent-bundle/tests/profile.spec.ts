/** The Science Agent bundle declares one locked science preset, six role presets, and paths that exist. */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Row {
  id?: string
  name?: string
  disabled?: unknown
  config?: Record<string, unknown> & { plugins?: Row[] }
  insert?: Row[]
}

interface JsExpr {
  __jsExpr: string
}

const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  files?: string[]
  dsh?: { bundle?: { patch?: string[] } }
}

function load(path: string): Row[] {
  return yaml.load(readFileSync(resolve(root, path), 'utf8'), { schema: entryListSchema }) as Row[]
}

const patchPaths = manifest.dsh?.bundle?.patch ?? []
const patches = patchPaths.map(load)
const [main = [], rolesPatch = []] = patches
const inserted = patches.flat().flatMap(row => row.insert ?? [])

function byId(rows: readonly Row[] | undefined): Map<string, Row> {
  return new Map((rows ?? []).map(row => [row.id ?? '', row]))
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item: unknown): item is Row => typeof item === 'object' && item !== null) : []
}

function isJsExpr(value: unknown): value is JsExpr {
  return typeof value === 'object' && value !== null && typeof (value as Partial<JsExpr>).__jsExpr === 'string'
}

function collectExpressions(value: unknown, out: string[] = []): string[] {
  if (isJsExpr(value)) out.push(value.__jsExpr)
  else if (Array.isArray(value)) for (const item of value) collectExpressions(item, out)
  else if (typeof value === 'object' && value !== null) for (const item of Object.values(value)) collectExpressions(item, out)
  return out
}

// The Loader evaluates `!!js` inside `with (ctx)`; a profile row's baseUrl is the profile directory,
// where the bundle package is linked. Its own directory resolves the same package name.
// oxlint-disable-next-line typescript/no-implied-eval -- reproduces the Loader's `!!js` evaluation over the shipped patch text
const evaluate = new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }') as (ctx: object, expr: string) => unknown
const baseUrl = pathToFileURL(resolve(root, 'package.json')).href

describe('Science Agent bundle', () => {
  it('lists both patch files and depends on every plugin a row names', () => {
    expect(patchPaths).toEqual(['./cordis.patch.yml', './presets/roles.patch.yml'])
    const names = new Set<string>()
    const visit = (rows: readonly Row[]): void => {
      for (const row of rows) {
        if (row.name?.startsWith('@deepseek-ai/')) names.add(row.name)
        if (row.insert) visit(row.insert)
        if (row.config?.plugins) visit(row.config.plugins)
        visit(rowsOf(row.config))
      }
    }
    for (const patch of patches) visit(patch)
    for (const plugins of inserted.map(row => row.config?.plugins ?? [])) {
      for (const plugin of plugins) visit(rowsOf(plugin.config))
    }
    expect(names.size).toBeGreaterThan(20)
    for (const name of names) expect(manifest.dependencies?.[name], name).toBe('workspace:*')
  })

  it('locks the profile to the science preset and mounts the loop view', () => {
    const registry = main.find(row => row.id === 'agent-preset-registry')
    expect(registry?.config).toEqual({ default: 'science', modeSelectionEnabled: false })
    expect(inserted.find(row => row.id === 'science-loop-ui')?.name).toBe('@deepseek-ai/dsh-experimental-client-ui-science-loop')

    const preset = inserted.find(row => row.id === 'preset-science')
    expect(preset?.config?.id).toBe('science')
    const plugins = byId(preset?.config?.plugins)
    for (const id of ['persona', 'skill-filesystem', 'tool-skill', 'delegation', 'mcp-science-agent', 'hooks-science-agent']) {
      expect(plugins.has(id), id).toBe(true)
    }
    expect(plugins.get('skill-filesystem')?.config?.includeDefaultRoots).toBe(false)

    const delegation = rowsOf(plugins.get('delegation')?.config)
    const delegationIds = new Set(delegation.map(row => row.id))
    for (const id of ['workflow-ptc', 'tool-workflow', 'tool-subagent']) expect(delegationIds.has(id), id).toBe(true)
    expect(rowsOf(byId(delegation).get('tool-workflow')?.config?.workflowDirs)).toHaveLength(1)

    const roleRows = delegation.filter(row => row.id?.startsWith('tool-subagent-sa-'))
    expect(roleRows.map(row => row.config?.toolName).sort()).toEqual(
      ['sa_engineer', 'sa_hypothesis', 'sa_reporter', 'sa_scout', 'sa_statistician', 'sa_verifier'],
    )
    for (const row of roleRows) {
      expect(Object.keys(row.config ?? {}).sort()).toEqual(['agentPreset', 'provider', 'toolName'])
      expect(row.config?.agentPreset).toBe(String(row.config?.toolName).replace('_', '-'))
    }

    const rolePresets = new Map(rolesPatch.flatMap(row => row.insert ?? []).map(row => [String(row.config?.id), row]))
    expect([...rolePresets.keys()].sort()).toEqual(roleRows.map(row => row.config?.agentPreset).sort())
    const writable = [...rolePresets].filter(([, row]) => {
      const fs = byId(row.config?.plugins).get('tool-fs')?.config ?? {}
      return fs.write !== false && fs.edit !== false
    }).map(([id]) => id)
    expect(writable).toEqual(['sa-engineer'])
  })

  it('resolves every !!js path and persona to a shipped file', () => {
    const ctx = { baseUrl, process }
    const results: unknown[] = []
    for (const patch of patches) {
      for (const expr of collectExpressions(patch)) {
        if (!expr.includes('createRequire(baseUrl)')) continue
        results.push(evaluate(ctx, expr))
      }
    }
    const paths = results.filter((value): value is string => typeof value === 'string' && value.startsWith(root))
    expect(paths.length).toBeGreaterThan(10)
    for (const path of paths) expect(existsSync(path), path).toBe(true)

    for (const role of byId(rolesPatch.flatMap(row => row.insert ?? []))) {
      const persona = byId(role[1].config?.plugins).get('persona')?.config?.prefix
      if (!isJsExpr(persona)) throw new Error(`${role[0]} persona is not a !!js file read`)
      const text = evaluate(ctx, persona.__jsExpr)
      expect(typeof text === 'string' && text.startsWith('Runtime mapping (DeepSeek Harness):'), role[0]).toBe(true)
      expect(text).not.toMatch(/\n$/u)
    }
  })

  it('publishes the files the patches read', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['cordis.patch.yml', 'presets/roles.patch.yml', 'hooks/hooks.json', 'skills', 'synced']))
    expect(statSync(resolve(root, 'synced/scripts/mcp-server.sh')).mode & 0o111).not.toBe(0)
    const hooks = JSON.parse(readFileSync(resolve(root, 'hooks/hooks.json'), 'utf8')) as {
      hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>
    }
    expect(hooks.hooks.PreToolUse?.[0]?.matcher).toBe('write|edit|bash')
    for (const command of Object.values(hooks.hooks).flat().flatMap(entry => entry.hooks.map(hook => hook.command))) {
      const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/u.exec(command)?.[1]
      expect(script && existsSync(resolve(root, script)), command).toBe(true)
    }
  })

  it('ships the eight command skills and both science skills', () => {
    const commandSkills = ['sa-campaign', 'sa-doctor', 'sa-kaggle', 'sa-report', 'sa-round', 'sa-status', 'sa-submit', 'sa-verify']
    for (const name of commandSkills) {
      const text = readFileSync(resolve(root, 'skills', name, 'SKILL.md'), 'utf8')
      expect(text).toContain(`name: ${name}\n`)
      expect(text).toContain('user-invocable: true\n')
    }
    for (const name of ['science-agent', 'science-agent-kaggle']) {
      const text = readFileSync(resolve(root, 'synced/skills', name, 'SKILL.md'), 'utf8')
      expect(text).toContain('## DeepSeek Harness runtime')
      expect(text).toContain('Mapping rule')
      expect(text).not.toContain('/science-agent:')
    }
    expect(readFileSync(resolve(root, 'synced/skills/science-agent-kaggle/SKILL.md'), 'utf8')).toContain('name: "science-campaign"')
  })
})
