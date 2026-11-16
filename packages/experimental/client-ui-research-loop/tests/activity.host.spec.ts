import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'
import { activityProjection, initActivityState, reduceActivityEvent, toActivityView } from '../src/projection/activity.ts'
import type { ActivityState } from '../src/shared/activity-schema.ts'
import { event, undefinedPaths } from './session-events.ts'

function fold(events: readonly SessionEvent[], state: ActivityState = initActivityState()): ActivityState {
  return events.reduce(reduceActivityEvent, state)
}

const prompt = (text: string, kind = 'user'): SessionEvent => event('user/message', {
  id: 'm', role: 'user', source: { kind }, content: [{ type: 'text', text }],
})
const toolCall = (callId: string, name: string, args: object, turn = 1): SessionEvent =>
  event('tool/call', { turn, step: 1, callId, name, arguments: JSON.stringify(args) })
const toolResult = (callId: string, isError = false, reason?: string): SessionEvent => event('tool/result', {
  turn: 1,
  step: 1,
  message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: 'ok' }], isError },
  ...(reason === undefined ? {} : { error: { name: 'ToolError', code: 'failed', reason } }),
})
const bash = (callId: string, command: string, description = `run ${callId}`, turn = 1): SessionEvent =>
  toolCall(callId, 'bash', { command, description }, turn)
const registered = (jobId: string, callId: string): SessionEvent => event('job/registered', {
  jobId, owner: 's-1', kind: 'bash', label: 'cmd', startedAt: 1, toolCall: { callId, rootCallId: callId },
})
const jobSettled = (jobId: string, callId: string, status: string, detail?: string): SessionEvent => event('job/settled', {
  jobId, owner: 's-1', kind: 'bash', label: 'cmd', startedAt: 1, toolCall: { callId, rootCallId: callId },
  finishedAt: 9_000, status, cause: { kind: 'producer' }, producerReported: true, ...(detail === undefined ? {} : { detail }),
})
const turnStart = (turn: number): SessionEvent => event('turn/start', { turn })
const turnEnd = (turn: number, kind = 'completed'): SessionEvent => event('turn/end', { turn, reason: { kind } })

describe('activity fold', () => {
  it('groups commands and file changes by turn under the prompt', () => {
    const state = fold([
      turnStart(1),
      prompt('continue   the\nexperiment'),
      prompt('injected context', 'notice'),
      bash('c1', 'ls -la', 'Inspect working directory'),
      registered('j1', 'c1'),
      jobSettled('j1', 'c1', 'completed'),
      toolResult('c1'),
      toolCall('c2', 'edit', { file_path: 'tools/probe.py', old_string: 'a', new_string: 'b' }),
      toolCall('c3', 'write', { file_path: 'tools/probe.py', content: 'x' }),
      toolResult('c2'),
      toolResult('c3', true, 'permission denied'),
      toolCall('c4', 'read', { file_path: 'notes.md' }),
      turnEnd(1),
    ])
    const [turn] = toActivityView(state).turns
    expect(turn).toMatchObject({ turn: 1, headline: 'continue the experiment', status: 'completed', files: ['tools/probe.py'] })
    expect(turn?.steps.map(step => [step.kind, step.label, step.status])).toEqual([
      ['command', 'Inspect working directory', 'completed'],
      ['edit', 'tools/probe.py', 'completed'],
      ['write', 'tools/probe.py', 'failed'],
    ])
    expect(turn?.steps[0]).toMatchObject({ command: 'ls -la', background: false })
    expect(turn?.steps[2]?.detail).toBe('permission denied')
    expect(state.calls).toEqual({})
    expect(state.jobs).toEqual({})
    expect(undefinedPaths(toActivityView(state))).toEqual([])
    expect(activityProjection.wire.viewSchema.parse(toActivityView(state))).toEqual(toActivityView(state))
  })

  it('leaves loop work out', () => {
    const base = fold([turnStart(1)])
    for (const loopCall of [
      bash('s1', 'sagent -w /ws research status --json'),
      bash('s2', 'cd /ws && uv run sagent round begin --mode quick --json'),
      toolCall('w1', 'workflow', { name: 'science-campaign', args: { workspace: '/ws' } }),
      toolCall('m1', 'mcp__science-agent__sa_round', { action: 'begin' }),
      toolCall('r1', 'sa_engineer', { prompt: 'build' }),
      toolCall('k1', 'skill', { name: 'science-agent' }),
    ]) {
      expect(reduceActivityEvent(base, loopCall)).toBe(base)
    }
    expect(reduceActivityEvent(base, toolResult('unknown'))).toBe(base)
    expect(reduceActivityEvent(base, jobSettled('j-unknown', 'unknown', 'completed'))).toBe(base)
    expect(reduceActivityEvent(base, registered('j-unknown', 'unknown'))).toBe(base)
  })

  it('follows a background command until its job settles', () => {
    const running = fold([turnStart(1), prompt('train'), bash('c1', 'python train.py &'), registered('j1', 'c1'), toolResult('c1'), turnEnd(1)])
    const [turn] = running.turns
    expect(turn?.status).toBe('completed')
    expect(turn?.steps[0]).toMatchObject({ status: 'running', background: true, jobId: 'j1' })
    const failed = fold([jobSettled('j1', 'c1', 'failed', 'exit code: 3')], running)
    expect(failed.turns[0]?.steps[0]).toMatchObject({ status: 'failed', endedAt: 9_000, detail: 'exit code: 3' })
    const killed = fold([jobSettled('j1', 'c1', 'killed')], running)
    expect(killed.turns[0]?.steps[0]?.status).toBe('cancelled')
    expect(killed.jobs).toEqual({})
  })

  it('cancels unfinished steps when the turn is interrupted, and fails the turn on an error', () => {
    const interrupted = fold([turnStart(1), bash('c1', 'sleep 100'), turnEnd(1, 'interrupted')])
    expect(interrupted.turns[0]).toMatchObject({ status: 'cancelled' })
    expect(interrupted.turns[0]?.steps[0]?.status).toBe('cancelled')
    expect(interrupted.calls).toEqual({})
    const errored = fold([turnStart(2), bash('c2', 'make', 'Build', 2), toolResult('c2'), turnEnd(2, 'error')])
    expect(errored.turns[0]?.status).toBe('failed')
    expect(fold([turnStart(3), bash('c3', 'x', 'X', 3), turnEnd(3, 'forked')]).turns[0]?.status).toBe('cancelled')
    expect(fold([turnStart(4), turnEnd(4)]).turns).toEqual([])
    expect(fold([turnEnd(9)]).turns).toEqual([])
  })

  it('keeps a turn without a prompt and a step without a description', () => {
    const state = fold([bash('c1', 'echo hi', ''), toolCall('c2', 'bash', { description: 'no command' }), toolCall('c3', 'edit', {})])
    expect(state.turns[0]?.headline).toBeUndefined()
    expect(state.turns[0]?.steps.map(step => step.label)).toEqual(['echo hi'])
    expect(fold([turnStart(1), prompt('   ')]).headline).toBeUndefined()
  })

  it('bounds turns, steps, and files', () => {
    const many = fold(Array.from({ length: 15 }, (_, index) => bash(`t${index}`, 'ls', 'List', index + 1)))
    expect(many.turns.map(turn => turn.turn)).toEqual(Array.from({ length: 12 }, (_, index) => index + 4))
    const steps = fold(Array.from({ length: 45 }, (_, index) => bash(`s${index}`, 'ls')))
    expect(steps.turns[0]?.steps).toHaveLength(40)
    expect(steps.turns[0]?.dropped).toBe(5)
    const files = fold(Array.from({ length: 15 }, (_, index) => toolCall(`f${index}`, 'write', { file_path: `out/${index}.txt`, content: '' })))
    expect(files.turns[0]?.files).toHaveLength(12)
    const jobs = fold(Array.from({ length: 55 }, (_, index) => registered(`j${index}`, 's0')), steps)
    expect(Object.keys(jobs.jobs)).toHaveLength(50)
  })
})
