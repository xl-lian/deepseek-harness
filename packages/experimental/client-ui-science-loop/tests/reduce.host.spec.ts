import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { describe, expect, it } from 'vitest'
import { initLoopState, reduceLoopEvent } from '../src/projection/reduce.ts'
import { toLoopView } from '../src/projection/view.ts'
import type { LoopState } from '../src/shared/types.ts'

let seq = 0

function event(type: string, data: unknown): SessionEvent {
  seq += 1
  return { type, seq, time: 1_000 + seq, data } as unknown as SessionEvent
}

function reduce(events: readonly SessionEvent[]): LoopState {
  return events.reduce(reduceLoopEvent, initLoopState())
}

function workflowCall(callId: string, roundId = 'rd-1'): SessionEvent {
  return event('tool/call', {
    turn: 1,
    step: 1,
    callId,
    name: 'workflow',
    arguments: JSON.stringify({ meta: { name: 'kaggle-round' }, script: '', args: { roundId, mode: 'full' } }),
  })
}

function toolResult(callId: string, payload: unknown): SessionEvent {
  return event('tool/result', {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      source: { kind: 'tool', callId },
      toolCallId: callId,
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      isError: false,
    },
  })
}

describe('loop reducer', () => {
  it('folds one workflow round and its structured result', () => {
    const state = reduce([
      workflowCall('call-1'),
      event('tool-workflow/run-start', { runId: 'run-1', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'scout', phase: 'Scout', childId: 'child-1' }),
      event('tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }),
      event('tool-workflow/agent-start', { runId: 'run-1', seq: 2, label: 'engineer-h-aaa', phase: 'Implement & Execute', childId: 'child-2' }),
      event('tool-workflow/agent-end', { runId: 'run-1', seq: 2, outcome: 'completed' }),
      event('tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }),
      toolResult('call-1', {
        started: true,
        roundId: 'rd-1',
        mode: 'full',
        scout: {
          status: 'ok',
          summary: 'tabular binary target',
          metric: 'auc',
          task_type: 'tabular',
          cv_recommendation: { strategy: 'stratified-kfold', reason: 'balanced' },
          risks: ['leakage in id'],
        },
        hypotheses: [{ hypothesis_id: 'h-aaa', experiment_id: 'x-aaa', statement: 'use log target' }],
        results: [{ status: 'ok', run_ids: ['r-1'], metrics: { auc: 0.8 } }],
        l3: { round_summary: 'stable', notes: 'one seed' },
      }),
    ])

    expect(state.rounds).toHaveLength(1)
    const round = state.rounds[0]!
    expect(round.roundId).toBe('rd-1')
    expect(round.anchor.id).toBe('run:run-1')
    expect(round.suppressedAnchors).toContain('call:call-1')
    expect(round.scout?.summary).toBe('tabular binary target')
    expect(round.scout?.cv?.strategy).toBe('stratified-kfold')
    expect(round.scout?.cv?.reason).toBe('balanced')
    expect(round.hypotheses?.[0]?.hypothesisId).toBe('h-aaa')
    expect(round.l3?.roundSummary).toBe('stable')
    expect(round.stages.scout.status).toBe('completed')
    expect(round.stages.engineer.status).toBe('completed')
    expect(round.stages.engineer.members[0]?.runIds).toEqual(['r-1'])
    expect(round.stages.engineer.members[0]?.metrics).toEqual({ auc: 0.8 })
    expect(round.stages.verifier.status).toBe('pending')
    expect(round.status).toBe('running')

    const view = toLoopView(state)
    expect(view.rounds[0]?.stages.scout.members[0]?.childId).toBe('child-1')
  })

  it('keeps the latest attempt per hypothesis through repair', () => {
    const state = reduce([
      workflowCall('call-1', 'rd-2'),
      event('tool-workflow/run-start', { runId: 'run-2', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-2', seq: 1, label: 'engineer-h-bbb', phase: 'Implement & Execute', childId: 'child-1' }),
      event('tool-workflow/agent-end', { runId: 'run-2', seq: 1, outcome: 'failed' }),
      event('tool-workflow/agent-start', { runId: 'run-2', seq: 2, label: 'repair-h-bbb', phase: 'Implement & Execute', childId: 'child-2' }),
    ])
    const round = state.rounds[0]!
    expect(round.stages.engineer.members).toHaveLength(2)
    expect(round.stages.engineer.status).toBe('running')
  })

  it('records decide and report from orchestrator CLI calls', () => {
    const state = reduce([
      event('tool/call', {
        turn: 1,
        step: 1,
        callId: 'call-begin',
        name: 'bash',
        arguments: JSON.stringify({ command: 'sagent -w /ws round begin --mode quick --json' }),
      }),
      toolResult('call-begin', { round_id: 'rd-3', mode: 'quick', stages: [] }),
      event('tool/call', {
        turn: 1,
        step: 2,
        callId: 'call-decide',
        name: 'bash',
        arguments: JSON.stringify({ command: 'sagent -w /ws decide --round rd-3 --json' }),
      }),
      toolResult('call-decide', {
        decision_id: 'd-1',
        chosen_run_id: 'r-best',
        rationale_code: 'best_verified_mean',
        eliminated: [{ run_id: 'r-bad', reason: 'no_verdict' }],
      }),
    ])
    const round = state.rounds[0]!
    expect(round.roundId).toBe('rd-3')
    expect(round.mode).toBe('quick')
    expect(round.decision?.chosenRunId).toBe('r-best')
    expect(round.decision?.eliminated).toEqual([{ runId: 'r-bad', reason: 'no_verdict' }])
    expect(round.stages.decide.status).toBe('completed')
  })

  it('marks a running workflow member interrupted when the turn is interrupted', () => {
    const state = reduce([
      workflowCall('call-1', 'rd-4'),
      event('tool-workflow/run-start', { runId: 'run-4', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-4', seq: 1, label: 'scout', phase: 'Scout', childId: 'child-1' }),
      event('turn/end', { turn: 1, reason: { kind: 'interrupted' } }),
    ])
    const round = state.rounds[0]!
    expect(round.stages.scout.members[0]?.status).toBe('interrupted')
  })

  it('closes a settled round when the turn ends', () => {
    const state = reduce([
      workflowCall('call-1', 'rd-5'),
      event('tool-workflow/run-start', { runId: 'run-5', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-5', seq: 1, label: 'scout', phase: 'Scout', childId: 'child-1' }),
      event('tool-workflow/agent-end', { runId: 'run-5', seq: 1, outcome: 'completed' }),
      event('tool-workflow/run-end', { runId: 'run-5', stopReason: 'completed' }),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    const round = state.rounds[0]!
    expect(round.status).toBe('completed')
    expect(round.endedAt).toBeDefined()
  })

  it('ignores unrelated events without changing the state reference', () => {
    const state = initLoopState()
    expect(reduceLoopEvent(state, event('turn/start', { turn: 1 }))).toBe(state)
    expect(reduceLoopEvent(state, event('user/message', {}))).toBe(state)
  })

  it('tracks the current Agent preset and a loaded science skill without inventing a round', () => {
    const initial = initLoopState('science')
    const selected = reduceLoopEvent(initial, event('agent-preset/selected', { agentPreset: 'standard' }))
    const withSkill = reduceLoopEvent(selected, event('tool/call', {
      turn: 1,
      step: 1,
      callId: 'call-skill',
      name: 'skill',
      arguments: JSON.stringify({ name: 'science-agent' }),
    }))
    expect(initial.agentPreset).toBe('science')
    expect(selected.agentPreset).toBe('standard')
    expect(withSkill.scienceSkillLoaded).toBe(true)
    expect(withSkill.rounds).toHaveLength(0)
    expect(toLoopView(withSkill)).toMatchObject({ agentPreset: 'standard', scienceSkillLoaded: true, rounds: [] })
  })
})
