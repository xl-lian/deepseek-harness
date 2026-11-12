/** The synced hooks start a campaign on experiment requests and guard `.sa/` under dsh tool names. */

import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))

async function hasPython3(): Promise<boolean> {
  try {
    await execFileAsync('python3', ['--version'])
    return true
  } catch {
    // No python3 on PATH: the hooks cannot run on this host, so the suite skips.
    return false
  }
}

const python3Available = await hasPython3()

async function hook(script: string, payload: object): Promise<string> {
  const child = execFile('python3', ['-I', '-B', resolve(root, 'synced/hooks', script)])
  const output = new Promise<string>((resolveOutput, reject) => {
    let stdout = ''
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolveOutput(stdout)
      else reject(new Error(`${script} exited ${String(code)}`))
    })
  })
  child.stdin?.end(JSON.stringify(payload))
  return output
}

describe.skipIf(!python3Available)('synced science-agent hooks', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-science-hooks-'))
  const workspace = join(temp, 'ws')
  mkdirSync(join(workspace, '.sa'), { recursive: true })
  afterAll(() => {
    rmSync(temp, { recursive: true, force: true })
  })

  it('adds the campaign instruction to experiment requests only', async () => {
    const hit = JSON.parse(await hook('round_trigger.py', { prompt: '总结进展并继续后续实验', cwd: workspace })) as {
      hookSpecificOutput: { additionalContext: string }
    }
    expect(hit.hookSpecificOutput.additionalContext).toContain('EXPERIMENT REQUEST')
    expect(hit.hookSpecificOutput.additionalContext).toContain('`workflow` tool with {name: "science-campaign"')
    expect((await hook('round_trigger.py', { prompt: '解释一下这个函数', cwd: workspace })).trim()).toBe('')
  })

  it('denies ledger edits and submission bypasses under lower-case tool names', async () => {
    const denied = JSON.parse(await hook('guard.py', {
      tool_name: 'write', tool_input: { path: join(workspace, '.sa/ledger/events.jsonl') }, cwd: workspace,
    })) as { hookSpecificOutput: { permissionDecision: string } }
    expect(denied.hookSpecificOutput.permissionDecision).toBe('deny')
    const bash = JSON.parse(await hook('guard.py', {
      tool_name: 'bash', tool_input: { command: 'kaggle competitions submit -c x -f y -m z' }, cwd: workspace,
    })) as { hookSpecificOutput: { permissionDecision: string } }
    expect(bash.hookSpecificOutput.permissionDecision).toBe('deny')
    expect((await hook('guard.py', { tool_name: 'read', tool_input: { path: 'notes.md' }, cwd: workspace })).trim()).toBe('')
  })
})
