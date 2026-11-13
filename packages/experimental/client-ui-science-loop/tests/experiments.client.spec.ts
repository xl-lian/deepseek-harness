import { describe, expect, it } from 'vitest'
import { roundExperiments } from '../src/client/experiments.ts'
import { STAGES, type LoopMember, type LoopRound, type LoopStage, type StageId } from '../src/shared/types.ts'

function member(label: string, extra: Partial<LoopMember> = {}): LoopMember {
  return { id: `wf:${label}`, label, role: 'sa-engineer', agent: 'sa-engineer', kind: 'workflow', status: 'completed', ...extra }
}

function makeRound(members: Partial<Record<StageId, LoopMember[]>>, extra: Partial<LoopRound> = {}): LoopRound {
  const stages = Object.fromEntries(STAGES.map((id): [StageId, LoopStage] => [
    id,
    { id, status: (members[id]?.length ?? 0) > 0 ? 'completed' : 'pending', members: members[id] ?? [] },
  ])) as Record<StageId, LoopStage>
  return {
    id: 'round-1',
    roundId: 'rd-1',
    status: 'completed',
    anchor: { kind: 'workflow', id: 'run:1' },
    suppressedAnchors: [],
    stages,
    ...extra,
  }
}

describe('roundExperiments', () => {
  it('yields one round-level experiment before any hypothesis id is known', () => {
    const round = makeRound({ scout: [member('scout')] }, { status: 'running' })
    const experiments = roundExperiments(round)
    expect(experiments).toHaveLength(1)
    expect(experiments[0]?.key).toBe('round-1')
    expect(experiments[0]?.hypothesisId).toBeUndefined()
    expect(experiments[0]?.round).toBe(round)
  })

  it('splits Engineer and Verifier members by hypothesis and keeps the other stages shared', () => {
    const round = makeRound({
      scout: [member('scout')],
      engineer: [member('engineer-h-1', { startedAt: 1, runIds: ['r-1'] }), member('engineer-h-2', { startedAt: 2, runIds: ['r-2'] })],
      verifier: [
        member('verify-h-1', { startedAt: 3, verdict: 'fail', runIds: ['r-1'] }),
        member('verify-h-2', { startedAt: 4, verdict: 'pass', runIds: ['r-2'] }),
        member('reverify-h-1', { startedAt: 6, verdict: 'pass', runIds: ['r-1b'] }),
      ],
    }, {
      hypotheses: [{ hypothesisId: 'h-1', statement: 'log target' }, { hypothesisId: 'h-2', statement: 'target encoding' }],
    })
    const [first, second] = roundExperiments(round)
    expect(first?.key).toBe('h-1')
    expect(first?.hypothesis?.statement).toBe('log target')
    expect(first?.round.hypotheses).toEqual([{ hypothesisId: 'h-1', statement: 'log target' }])
    expect(first?.round.stages.engineer.members.map(entry => entry.label)).toEqual(['engineer-h-1'])
    expect(first?.round.stages.verifier.members.map(entry => entry.label)).toEqual(['verify-h-1', 'reverify-h-1'])
    expect(first?.verdict).toBe('pass')
    expect(first?.repaired).toBe(true)
    expect(first?.round.stages.scout).toBe(round.stages.scout)
    expect(second?.key).toBe('h-2')
    expect(second?.repaired).toBe(false)
    expect(second?.round.stages.verifier.members.map(entry => entry.label)).toEqual(['verify-h-2'])
  })

  it('takes hypothesis ids from confirm labels and orders unregistered ids by first appearance', () => {
    const round = makeRound({
      engineer: [member('engineer-h-b'), member('confirm-h-a')],
      verifier: [member('verify-confirm-h-a', { verdict: 'warn' })],
    })
    const experiments = roundExperiments(round)
    expect(experiments.map(entry => entry.key)).toEqual(['h-b', 'h-a'])
    expect(experiments[1]?.round.stages.verifier.members.map(entry => entry.label)).toEqual(['verify-confirm-h-a'])
    expect(experiments[1]?.verdict).toBe('warn')
  })

  it('attaches unlabeled members to the experiment sharing their runs, else to every experiment', () => {
    const round = makeRound({
      engineer: [
        member('engineer-h-1', { runIds: ['r-1'] }),
        member('engineer-h-2', { runIds: ['r-2'] }),
        member('promote', { role: 'sa-clerk' }),
      ],
      verifier: [member('sagent verify run', { runIds: ['r-2'], verdict: 'pass' })],
    })
    const [first, second] = roundExperiments(round)
    expect(first?.round.stages.engineer.members.map(entry => entry.label)).toEqual(['engineer-h-1', 'promote'])
    expect(first?.round.stages.verifier.members).toEqual([])
    expect(second?.round.stages.verifier.members.map(entry => entry.label)).toEqual(['sagent verify run'])
    expect(second?.verdict).toBe('pass')
  })

  it('derives each experiment status from its own members', () => {
    const round = makeRound({
      engineer: [member('engineer-h-1', { status: 'running' }), member('engineer-h-2', { status: 'failed' })],
    }, { status: 'running', hypotheses: [{ hypothesisId: 'h-1', statement: 'a' }, { hypothesisId: 'h-2', statement: 'b' }, { hypothesisId: 'h-3', statement: 'c' }] })
    expect(roundExperiments(round).map(entry => entry.status)).toEqual(['running', 'failed', 'pending'])
    expect(roundExperiments(round)[0]?.round.stages.engineer.status).toBe('running')
  })

  it('reports what the decision did with each experiment', () => {
    const round = makeRound({
      engineer: [
        member('engineer-h-1', { runIds: ['r-1'] }),
        member('engineer-h-2', { runIds: ['r-2'] }),
        member('engineer-h-3', { runIds: ['r-3'] }),
        member('engineer-h-4', { runIds: ['r-4'] }),
      ],
    }, {
      decision: {
        chosenRunId: 'r-1',
        eliminated: [{ runId: 'r-2', reason: 'leakage' }],
        candidates: [{ runId: 'r-1', rank: 1 }, { runId: 'r-3', rank: 2, verifiedMean: 0.8 }],
      },
    })
    expect(roundExperiments(round).map(entry => entry.outcome)).toEqual([
      { kind: 'chosen', runId: 'r-1' },
      { kind: 'eliminated', runId: 'r-2', reason: 'leakage' },
      { kind: 'candidate', candidate: { runId: 'r-3', rank: 2, verifiedMean: 0.8 } },
      undefined,
    ])
  })
})
