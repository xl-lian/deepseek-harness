/** The synced hooks route requests to their loop, ask for intake outside a workspace, and guard `.sa/` under dsh tool names. */

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

  const context = (prompt: string, cwd: string): string => (JSON.parse(runHook('round_trigger.py', { prompt, cwd })) as {
    hookSpecificOutput: { additionalContext: string }
  }).hookSpecificOutput.additionalContext

  it('names both saved loops, in the dsh workflow tool, for a request in a workspace', () => {
    for (const prompt of ['继续研究这个问题', '总结进展并继续后续实验', 'continue the experiment']) {
      const text = context(prompt, workspace)
      expect(text).toContain('EXPERIMENT REQUEST')
      expect(text).toContain('the dsh `workflow` tool with ({name: "research-loop"')
      expect(text).toContain('the dsh `workflow` tool with ({name: "science-campaign"')
      expect(text).not.toContain('science-agent:')
    }
    expect(runHook('round_trigger.py', { prompt: '解释一下这个函数', cwd: workspace })).toBe('')
  })

  it('asks for intake when the folder has no workspace', () => {
    const text = context('continue the experiment', scratch)
    expect(text).toContain('no science-agent workspace')
    expect(text).toContain('Intake')
    expect(text).toContain('science-agent-kaggle')
  })

  it('denies writes into the run store under the lower-case write tool', () => {
    const decision = (JSON.parse(runHook('guard.py', {
      tool_name: 'edit', tool_input: { path: join(workspace, '.sa/objects/plan.md') }, cwd: workspace,
    })) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision
    expect(decision).toBe('deny')
    expect(runHook('guard.py', { tool_name: 'write', tool_input: { path: join(workspace, 'research/guidance.md') }, cwd: workspace })).toBe('')
  })

  it('denies submission bypasses under the lower-case bash tool', () => {
    const decision = (JSON.parse(runHook('guard.py', {
      tool_name: 'bash', tool_input: { command: 'kaggle competitions submit -c x -f y -m z' }, cwd: workspace,
    })) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision
    expect(decision).toBe('deny')
  })
})
