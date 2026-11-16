/** The research loop fold turns a `research-loop` run and a research status result into rounds, experiments, and a ledger. */

import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { describe, expect, it } from 'vitest'
import { researchLoopProjection, toResearchView } from '../src/projection/definition.ts'
import { initResearchState, reduceResearchEvent } from '../src/projection/reduce.ts'
import { memberStage, parseLabel, parseLogLine } from '../src/shared/labels.ts'
import type { ResearchState } from '../src/shared/schema.ts'
import { call, event, result, undefinedPaths, workflowEvents } from './session-events.ts'

const { start, end, log } = workflowEvents('wf-1')

function fold(events: readonly SessionEvent[], from: ResearchState = initResearchState('research')): ResearchState {
  return events.reduce(reduceResearchEvent, from)
}

const loopReturn = {
  started: true,
  rounds: [{
    round_id: 'rd-1', number: 1, retrieval: { focuses: 1, passes: 1, enough: true },
    experiments: [{ id: 'e1', status: 'ran', verdict: 'supported', confidence: 'high', unresolved: [], run_ids: ['run-a'], reason: null }],
    decision: 'stop', reason: 'answered', needs_human: null, registered_plan: '.sa/objects/p', not_run_by_cap: ['e9'], closed: true,
  }],
  stop: { reason: 'decided', detail: 'answered' },
  report: { round_id: 'rd-1', answer: 'Warmup widens the range.', markdown: '# R' },
}

describe('research loop labels and narration', () => {
  it('parses member labels into round, kind, and ids', () => {
    expect(parseLabel('r2-read-lit_1')).toEqual({ round: 2, kind: 'read', focusId: 'lit_1' })
    expect(parseLabel('r1-run-e-1-3')).toEqual({ round: 1, kind: 'run', experimentId: 'e-1', pass: 3 })
    expect(parseLabel('r1-challenge-e1-2')).toEqual({ round: 1, kind: 'challenge', experimentId: 'e1', pass: 2 })
    expect(parseLabel('r3-save-plan-retry')).toEqual({ round: 3, kind: 'save' })
    expect(parseLabel('close-2')).toEqual({ kind: 'close' })
    expect(parseLabel('open-1')).toBeUndefined()
    expect(memberStage({ kind: 'save', label: 'r1-save-plan' })).toBe('plan')
    expect(memberStage({ kind: 'save', label: 'r1-save-e1', experimentId: 'e1' })).toBe('validate')
    expect(memberStage({ kind: 'save', label: 'r1-save-next' })).toBe('next')
  })

  it('parses the narration grammar and leaves other lines unparsed', () => {
    expect(parseLogLine('Round 2 (rd-9): resuming a round that was opened but not closed.')).toEqual({ kind: 'open', round: 2, roundId: 'rd-9', reused: true })
    expect(parseLogLine('Round 1 plan: registered · e1 "A \\"b\\"" [confirmatory] · e2 "C" [exploratory]')).toEqual({
      kind: 'plan', round: 1, experiments: [{ id: 'e1', title: 'A "b"', role: 'confirmatory' }, { id: 'e2', title: 'C', role: 'exploratory' }],
    })
    expect(parseLogLine('Round 1 e1: refuted (medium) · open objections: o1, o2 · runs r-1')).toMatchObject({
      kind: 'verdict', id: 'e1', verdict: 'refuted', unresolved: ['o1', 'o2'], runIds: ['r-1'],
    })
    expect(parseLogLine('Round 1 e2: blocked — no data · runs r-2')).toMatchObject({ kind: 'outcome', outcome: 'blocked', reason: 'no data', runIds: ['r-2'] })
    expect(parseLogLine('Round 1: no reading needed (x).')).toEqual({ kind: 'round-note', round: 1, text: 'no reading needed (x).' })
    expect(parseLogLine('Round 1 plan: registered · broken')).toBeUndefined()
    expect(parseLogLine('something else')).toBeUndefined()
  })
})

describe('research loop fold', () => {
  it('builds a round from member lifecycle, narration, and the final return value', () => {
    const state = fold([
      call('c1', 'skill', { name: 'science-research' }),
      call('c2', 'workflow', { name: 'research-loop', args: { workspace: '/ws/study' } }),
      event('tool-workflow/run-start', { runId: 'wf-1', name: 'research-loop' }),
      start(1, 'open-1'), end(1),
      log('Round 1 (rd-1).'),
      start(2, 'r1-retrieve-search'), end(2),
      start(3, 'r1-read-f1'), end(3),
      log('Round 1 reading: 1 focus note(s), 1 pass(es), enough'),
      log('Round 1 plan: registered · e1 "Warmup" [confirmatory]'),
      start(4, 'r1-build-e1'), end(4),
      log('Round 1 e1: supported (high) · runs run-a'),
      log('Round 1 next step: stop — answered'),
      log('Round 1 needs a human: approve network'),
      start(5, 'close-1'), end(5),
      log('Write-up: Warmup widens the range.'),
      event('tool-workflow/run-end', { runId: 'wf-1', stopReason: 'completed' }),
      result('c2', `Return value:\n${JSON.stringify(loopReturn)}`),
    ])
    expect(state.skillLoaded).toBe(true)
    for (const skill of ['science-agent', 'science-agent-kaggle', 'science-paper']) {
      expect(fold([call('s', 'skill', { name: skill })]).skillLoaded).toBe(true)
    }
    expect(fold([call('s', 'skill', { name: 'other' })]).skillLoaded).toBe(false)
    expect(state.calls).toEqual({})
    const run = state.runs[0]
    expect(run).toMatchObject({ runId: 'wf-1', callId: 'c2', workspace: '/ws/study', status: 'completed', stop: { reason: 'decided' }, answer: 'Warmup widens the range.' })
    const round = run?.rounds[0]
    expect(round).toMatchObject({
      number: 1, roundId: 'rd-1', status: 'completed', decision: 'stop', reason: 'answered', needsHuman: 'approve network',
      retrieval: { focuses: 1, passes: 1, enough: true }, plan: { registered: true, snapshot: '.sa/objects/p' },
    })
    expect(round?.members.map(member => [member.label, member.status])).toEqual([
      ['r1-retrieve-search', 'completed'], ['r1-read-f1', 'completed'], ['r1-build-e1', 'completed'], ['close-1', 'completed'],
    ])
    expect(round?.experiments).toEqual([
      { id: 'e1', title: 'Warmup', role: 'confirmatory', outcome: 'ran', verdict: 'supported', confidence: 'high', unresolved: [], runIds: ['run-a'] },
      { id: 'e9', notRunByCap: true },
    ])
    expect(researchLoopProjection.wire.viewSchema.parse(toResearchView(state))).toEqual(toResearchView(state))
    expect(researchLoopProjection.stateSchema.parse(state)).toEqual(state)
    expect(undefinedPaths(state)).toEqual([])
  })

  it('keeps the latest research status as the ledger', () => {
    const status = {
      question: 'Does warmup help?', notebook: {}, sources: 4, citations: 3, searches: 2,
      rounds: [{
        round_id: 'rd-1', number: 1, decision: 'stop', reason: 'answered',
        registered_plan: { path: 'research/rounds/01/plan.md', registered_at: 't', changed_since: false },
        experiments: [{
          id: 'e1', role: 'confirmatory', build: 'ready', runs: ['run-a'], verdict: 'supported', confidence: 'high', verdict_by: 'r1-check-e1',
          evidence_class: 'exploratory', demoted_by: ['code changed after run run-a finished: run-b'], flags: [],
          objections: [{ id: 'o1', status: 'resolved by recheck', summary: 'seeds' }],
        }],
      }],
    }
    const state = fold([
      call('s1', 'bash', { command: 'sagent -w "/ws/study" research status --json | tail -1' }),
      result('s1', JSON.stringify({ ok: true, data: status })),
    ])
    expect(state.ledger).toMatchObject({
      workspace: '/ws/study', question: 'Does warmup help?', sources: 4, citations: 3,
      rounds: [{ roundId: 'rd-1', registeredPlan: { path: 'research/rounds/01/plan.md', changedSince: false } }],
    })
    expect(undefinedPaths(state)).toEqual([])
    expect(state.ledger?.rounds[0]?.experiments[0]).toMatchObject({
      evidenceClass: 'exploratory', demotedBy: ['code changed after run run-a finished: run-b'], objections: [{ id: 'o1', status: 'resolved by recheck' }],
    })
  })

  it('sends a view with no undefined values', () => {
    const view = toResearchView(initResearchState())
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
    expect(undefinedPaths(view)).toEqual([])
  })

  it('returns the same state for unrelated events and cancels a running loop on interruption', () => {
    const base = fold([
      call('c2', 'workflow', { name: 'research-loop', args: { workspace: '/ws' } }),
      event('tool-workflow/run-start', { runId: 'wf-1', name: 'research-loop' }),
      start(1, 'r1-plan'),
    ])
    for (const unrelated of [
      call('x', 'bash', { command: 'ls' }),
      event('tool-workflow/log', { runId: 'wf-2', message: 'Round 1 (rd-1).' }),
      result('unknown', 'text'),
    ]) {
      expect(reduceResearchEvent(base, unrelated)).toBe(base)
    }
    // A campaign run becomes a campaign round and leaves the research runs untouched.
    const campaign = reduceResearchEvent(base, event('tool-workflow/run-start', { runId: 'wf-2', name: 'science-campaign' }))
    expect(campaign.runs).toBe(base.runs)
    expect(campaign.campaign.rounds.map(round => round.status)).toEqual(['running'])
    const interrupted = reduceResearchEvent(base, event('turn/end', { turn: 1, reason: { kind: 'interrupted' } }))
    expect(interrupted.runs[0]?.status).toBe('cancelled')
    expect(interrupted.runs[0]?.rounds[0]?.status).toBe('cancelled')
    expect(interrupted.runs[0]?.rounds[0]?.members[0]?.status).toBe('cancelled')
  })

  it('bounds members per round and runs per Session', () => {
    let state = fold([
      call('c2', 'workflow', { name: 'research-loop', args: {} }),
      event('tool-workflow/run-start', { runId: 'wf-1', name: 'research-loop' }),
    ])
    for (let index = 0; index < 200; index += 1) state = reduceResearchEvent(state, start(100 + index, `r1-read-f${index}`))
    expect(state.runs[0]?.rounds[0]?.members).toHaveLength(160)
    for (let index = 0; index < 25; index += 1) state = reduceResearchEvent(state, event('tool-workflow/run-start', { runId: `wf-x${index}`, name: 'research-loop' }))
    expect(state.runs).toHaveLength(20)
  })
})
