import { describe, expect, it } from 'vitest'
import { campaignViewSchema } from '../src/shared/campaign-schema.ts'
import { toCampaignView } from '../src/projection/campaign-view.ts'
import { STAGES, type LoopMember, type LoopRound, type LoopStage, type CampaignState, type StageId } from '../src/shared/campaign-types.ts'

function stage(id: StageId, status: LoopStage['status'], members: LoopStage['members'] = []): LoopStage {
  return { id, status, members }
}

const manyChecks: LoopMember['checks'] = Array.from({ length: 100 }, (_, index) => ({
  layer: 'L2',
  checkId: `check-${index}`,
  status: 'pass' as const,
  summary: `summary-${index}`,
}))

const member: LoopMember = {
  id: 'wf:1',
  label: 'verify-h-1',
  role: 'sa-verifier',
  agent: 'sa-verifier',
  kind: 'workflow',
  status: 'completed',
  verdict: 'pass',
  trust: 'medium',
  checks: manyChecks,
  files: Array.from({ length: 40 }, (_, index) => `file-${index}.py`),
  plan: 'x'.repeat(2000),
  blockingFailures: Array.from({ length: 20 }, (_, index) => `failure-${index}`),
}

const stages = Object.fromEntries(STAGES.map(id => [id, stage(id, 'pending')])) as Record<StageId, LoopStage>
stages.verifier = stage('verifier', 'completed', [member])
stages.scout = stage('scout', 'completed', [{
  id: 'wf:0', label: 'scout', role: 'sa-scout', agent: 'sa-scout', kind: 'workflow', status: 'completed',
}])

const round: LoopRound = {
  id: 'round-1',
  roundId: 'rd-1',
  mode: 'full',
  status: 'running',
  startedAt: 1,
  anchor: { kind: 'workflow', id: 'run:run-1' },
  suppressedAnchors: [],
  stages,
  hypotheses: Array.from({ length: 30 }, (_, index) => ({
    hypothesisId: `h-${index}`,
    statement: `stmt-${index}`,
  })),
  decision: {
    chosenRunId: 'r-1',
    rationaleCode: 'best_verified_mean',
    eliminated: [],
    candidates: Array.from({ length: 30 }, (_, index) => ({ runId: `r-${index}` })),
  },
  report: {
    path: 'reports/r.md',
    ok: true,
    strict: true,
    issues: Array.from({ length: 30 }, (_, index) => ({ line: index, token: '0.83', text: 'unsourced' })),
  },
}

const state: CampaignState = { rounds: [round], calls: {}, runs: {} }

describe('wire schema', () => {
  it('accepts the bounded campaign view and enforces caps', () => {
    const view = toCampaignView(state)
    const parsed = campaignViewSchema.parse(view)
    expect(parsed.rounds).toHaveLength(1)
    const verifier = parsed.rounds[0]?.stages.verifier
    expect(verifier?.members[0]?.checks?.length).toBeLessThanOrEqual(32)
    expect(verifier?.members[0]?.files?.length).toBeLessThanOrEqual(20)
    expect(verifier?.members[0]?.blockingFailures?.length).toBeLessThanOrEqual(8)
    expect(verifier?.members[0]?.plan?.length).toBeLessThanOrEqual(801)
    expect(parsed.rounds[0]?.hypotheses?.length).toBeLessThanOrEqual(12)
    expect(parsed.rounds[0]?.decision?.candidates.length).toBeLessThanOrEqual(12)
    expect(parsed.rounds[0]?.report?.issues.length).toBeLessThanOrEqual(20)
  })
})

describe('wire view JSON', () => {
  it('omits absent round sections so the view survives a JSON round trip', () => {
    const bare: LoopRound = {
      id: 'round-2', roundId: 'rd-2', mode: 'full', status: 'running', startedAt: 2,
      anchor: { kind: 'workflow', id: 'run:run-2' }, suppressedAnchors: [], stages,
    }
    const view = toCampaignView({ rounds: [bare, round], calls: {}, runs: {} })
    for (const key of ['scout', 'hypotheses', 'decision', 'report', 'design']) {
      expect(view.rounds[0]).not.toHaveProperty(key)
    }
    expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view)
  })
})
