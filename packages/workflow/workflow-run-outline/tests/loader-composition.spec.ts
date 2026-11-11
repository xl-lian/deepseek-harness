/**
 * Real composition: the shipped YAML rows boot through the vendored Loader, the
 * function plugin's namespace survives, and a logged run serves the outline
 * through the composed registry.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import * as WorkflowRunOutlinePlugin from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadYaml(lines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-workflow-run-outline-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [...lines, ''].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-workflow-run-outline', WorkflowRunOutlinePlugin],
  ])
  type LoaderInternal = NonNullable<typeof context.loader.internal>
  context.loader.internal = Object.assign(Object.create(null) as LoaderInternal, {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  })
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('real Loader composition', () => {
  it('loads the shipped rows and serves the outline, then removes the key on unload', async () => {
    const loaded = await loadYaml([
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-session-projection'",
      '- id: outline',
      "  name: '@deepseek-ai/dsh-workflow-run-outline'",
    ])
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const session = loaded.sessions.create(SessionId('composed'))
    session.append('turn/start', { turn: 1 })
    session.append('tool-workflow/run-start', { runId: WorkflowRunId('run-1'), name: 'audit' })
    expect(loaded.sessionProjections.snapshot(session).values.workflowRuns).toMatchObject([{ runId: 'run-1', name: 'audit', turn: 1 }])

    const entry = [...loaded.loader.entries()].find(candidate => candidate.options.name === '@deepseek-ai/dsh-workflow-run-outline')
    await entry?.fiber?.dispose()
    expect(loaded.sessionProjections.snapshot(session).values).not.toHaveProperty('workflowRuns')
  })
})
