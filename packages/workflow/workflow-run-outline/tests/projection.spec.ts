import { describe, expect, it } from 'vitest'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { workflowRunsProjectionDefinition as unit } from '../src/projection.ts'
import type { WorkflowRunsState } from '../src/types.ts'

const RUN = WorkflowRunId('run-1')
let seq = 0

function event(type: string, data: unknown, time = seq * 10): SessionEvent {
  seq += 1
  return { type, data, seq: SessionSeq(seq), time } as SessionEvent
}

function fold(events: readonly SessionEvent[], from: WorkflowRunsState = unit.init()): WorkflowRunsState {
  return events.reduce((state, value) => unit.apply(state, value), from)
}

const started = (): SessionEvent[] => [
  event('turn/start', { turn: 1 }),
  event('tool-workflow/run-start', { runId: RUN, name: 'audit' }),
]

describe('workflowRuns projection', () => {
  it('folds a run from start through members, phase, and settlement', () => {
    const state = fold([
      ...started(),
      event('tool-workflow/phase', { runId: RUN, title: 'Scan' }),
      event('tool-workflow/agent-start', { runId: RUN, seq: 1, label: 'a', childId: 'c1' }),
      event('tool-workflow/agent-start', { runId: RUN, seq: 2, label: 'b', childId: 'c2' }),
      event('tool-workflow/agent-start', { runId: RUN, seq: 3, label: 'c', childId: 'c3' }),
      event('tool-workflow/agent-end', { runId: RUN, seq: 1, outcome: 'completed' }),
      event('tool-workflow/agent-end', { runId: RUN, seq: 2, outcome: 'failed' }),
      event('tool-workflow/agent-end', { runId: RUN, seq: 3, outcome: 'cancelled' }),
      event('tool-workflow/run-end', { runId: RUN, stopReason: 'error' }, 999),
    ])
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0]).toMatchObject({
      name: 'audit', currentPhase: 'Scan', stopReason: 'error', endedAt: 999, interrupted: false, turn: 1,
      members: { started: 3, completed: 1, failed: 1, cancelled: 1 },
    })
  })

  it('updates only the addressed run', () => {
    const second = WorkflowRunId('run-2')
    const state = fold([
      ...started(),
      event('tool-workflow/run-start', { runId: second, name: 'next' }),
      event('tool-workflow/phase', { runId: second, title: 'Scan' }),
    ])
    expect(state.runs.map(entry => entry.currentPhase)).toEqual([undefined, 'Scan'])
  })

  it('summarizes each metric series', () => {
    const state = fold([
      ...started(),
      event('tool-workflow/metric', { runId: RUN, name: 'loss', value: 2 }),
      event('tool-workflow/metric', { runId: RUN, name: 'loss', value: 1, step: 1 }),
      event('tool-workflow/metric', { runId: RUN, name: 'loss', value: 3, step: 2 }),
    ])
    expect(state.runs[0]!.metrics).toEqual({ loss: { latest: 3, min: 1, max: 3, count: 3 } })
  })

  it('keeps the rows identity across unrelated events and Turn starts', () => {
    const state = fold(started())
    expect(unit.apply(state, event('step/start', { turn: 1, step: 1 }))).toBe(state)
    expect(unit.apply(state, event('turn/start', { turn: 2 })).runs).toBe(state.runs)
  })

  it('ignores updates for an unknown run', () => {
    const state = fold(started())
    expect(unit.apply(state, event('tool-workflow/phase', { runId: WorkflowRunId('other'), title: 'x' }))).toBe(state)
  })

  it.each(['interrupted', 'forked'])('marks an unsettled run of a Turn ended as %s', (kind) => {
    const state = fold([...started(), event('turn/end', { turn: 1, reason: { kind } })])
    expect(state.runs[0]!.interrupted).toBe(true)
  })

  it('marks only the abandoned Turn\'s run', () => {
    const initial = fold([...started(), event('turn/end', { turn: 1, reason: { kind: 'completed' } })])
    const second = WorkflowRunId('run-2')
    const state = fold([
      event('turn/start', { turn: 2 }),
      event('tool-workflow/run-start', { runId: second, name: 'next' }),
      event('turn/end', { turn: 2, reason: { kind: 'interrupted' } }),
    ], initial)
    expect(state.runs.map(entry => entry.interrupted)).toEqual([false, true])
  })

  it('leaves a background run live through a normal Turn end and a later abnormal Turn', () => {
    const initial = fold([...started(), event('turn/end', { turn: 1, reason: { kind: 'completed' } })])
    expect(initial.runs[0]!.interrupted).toBe(false)
    const later = fold([event('turn/start', { turn: 2 }), event('turn/end', { turn: 2, reason: { kind: 'interrupted' } })], initial)
    expect(later.runs).toBe(initial.runs)
  })

  it('does not interrupt a settled run, and a late settlement clears the flag', () => {
    const settled = fold([...started(), event('tool-workflow/run-end', { runId: RUN, stopReason: 'completed' })])
    expect(unit.apply(settled, event('turn/end', { turn: 1, reason: { kind: 'interrupted' } }))).toBe(settled)
    const interrupted = fold([...started(), event('turn/end', { turn: 1, reason: { kind: 'forked' } })])
    expect(unit.apply(interrupted, event('turn/end', { turn: 1, reason: { kind: 'forked' } }))).toBe(interrupted)
    const late = unit.apply(interrupted, event('tool-workflow/run-end', { runId: RUN, stopReason: 'cancelled' }))
    expect(late.runs[0]).toMatchObject({ interrupted: false, stopReason: 'cancelled' })
  })

  it('restores a checkpoint to the same result as full replay', () => {
    const head = started()
    const tail = [
      event('tool-workflow/phase', { runId: RUN, title: 'Scan' }),
      event('tool-workflow/run-end', { runId: RUN, stopReason: 'completed' }),
    ]
    const checkpoint = unit.stateSchema.parse(JSON.parse(JSON.stringify(fold(head))))
    expect(fold(tail, checkpoint)).toEqual(fold([...head, ...tail]))
  })

  it('serves only the rows', () => {
    const state = fold(started())
    expect(unit.wire.view(state)).toBe(state.runs)
    expect(unit.wire.viewSchema.parse(JSON.parse(JSON.stringify(state.runs)))).toEqual(state.runs)
  })
})
