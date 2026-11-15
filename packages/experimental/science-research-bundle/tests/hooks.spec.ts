/** The synced hooks start the research loop on research requests and guard `.sa/` under dsh tool names. */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const python3 = spawnSync('python3', ['--version']).status === 0

function runHook(script: string, payload: object): string {
  const child = spawnSync('python3', ['-I', '-B', resolve(root, 'synced/hooks', script)], { input: JSON.stringify(payload), encoding: 'utf8' })
  if (child.status !== 0) throw new Error(`${script} exited ${String(child.status)}: ${child.stderr}`)
  return child.stdout.trim()
}

describe.skipIf(!python3)('synced research hooks', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-research-hooks-'))
  const workspace = join(scratch, 'study')
  mkdirSync(join(workspace, '.sa'), { recursive: true })
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it('names the research-loop workflow for a continue-research request in a workspace', () => {
    const context = (JSON.parse(runHook('round_trigger.py', { prompt: '继续研究这个问题', cwd: workspace })) as {
      hookSpecificOutput: { additionalContext: string }
    }).hookSpecificOutput.additionalContext
    expect(context).toContain('RESEARCH REQUEST')
    expect(context).toContain('{name: "research-loop"')
    expect(runHook('round_trigger.py', { prompt: 'continue research', cwd: scratch })).toBe('')
  })

  it('denies writes into the run store under the lower-case write tool', () => {
    const decision = (JSON.parse(runHook('guard.py', {
      tool_name: 'edit', tool_input: { path: join(workspace, '.sa/objects/plan.md') }, cwd: workspace,
    })) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision
    expect(decision).toBe('deny')
    expect(runHook('guard.py', { tool_name: 'write', tool_input: { path: join(workspace, 'research/guidance.md') }, cwd: workspace })).toBe('')
  })
})
