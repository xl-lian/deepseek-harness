import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { en } from '../src/client/locales.ts'
import { currentStage, stageSummary } from '../src/client/summary.ts'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/types.ts'

const t = ((key: string, params?: Record<string, string>) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value)
  return text
}) as TranslateNS<'scienceLoop'>

function stage(id: StageId, status: LoopStage['status'], members: LoopStage['members'] = []): LoopStage {
  return { id, status, members }
}

const stages = Object.fromEntries(STAGES.map(id => [id, stage(id, 'pending')])) as Record<StageId, LoopStage>
stages.scout = stage('scout', 'completed', [{
  id: 'wf:1', label: 'scout', role: 'sa-scout', agent: 'sa-scout', kind: 'workflow', status: 'completed', startedAt: 1, endedAt: 2,
}])
stages.engineer = stage('engineer', 'running', [{
  id: 'wf:2',
  label: 'engineer-h-1',
  role: 'sa-engineer',
  agent: 'sa-engineer',
  kind: 'workflow',
  status: 'running',
  startedAt: 3,
  plan: 'Added a log transform and kept features/CV fixed.',
  runIds: ['r-1'],
  metrics: { roc_auc: 0.83 },
}])
stages.verifier = stage('verifier', 'completed', [{
  id: 'wf:3',
  label: 'verify-h-1',
  role: 'sa-verifier',
  agent: 'sa-verifier',
  kind: 'workflow',
  status: 'completed',
  startedAt: 4,
  endedAt: 5,
  verdict: 'pass',
  trust: 'medium',
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
  scout: {
    summary: 'tabular binary classification',
    metric: 'roc_auc',
    taskType: 'tabular',
    rowsTrain: 1000,
    columns: 42,
    cv: { strategy: 'stratified-kfold', reason: 'balanced' },
    baselinePresent: false,
    risks: ['id leakage'],
    evidence: [],
  },
  hypotheses: [{
    hypothesisId: 'h-1',
    statement: 'log-transform the target',
    prediction: '+0.01 auc',
  }],
  decision: { chosenRunId: 'r-1', rationaleCode: 'best_verified_mean', eliminated: [], candidates: [] },
  report: { path: 'reports/r.md', ok: true, strict: true, issues: [] },
}

describe('currentStage', () => {
  it('prefers the running stage', () => {
    expect(currentStage(round)).toBe('engineer')
  })

  it('falls back to the most recently active stage', () => {
    const finished: LoopRound = {
      ...round,
      status: 'completed',
      stages: {
        ...round.stages,
        engineer: stage('engineer', 'completed', round.stages.engineer.members.map(member => ({ ...member, status: 'completed', endedAt: 10 }))),
      },
    }
    expect(currentStage(finished)).toBe('engineer')
  })
})

describe('stageSummary', () => {
  it('summarises scout profile and CV', () => {
    const lines = stageSummary(round, 'scout', t)
    expect(lines[0]).toBe('tabular · roc_auc · 1000×42')
    expect(lines[1]).toBe('CV stratified-kfold · no baseline')
    expect(lines[2]).toBe('id leakage')
  })

  it('lists hypotheses on the hypotheses stage', () => {
    const lines = stageSummary(round, 'hypotheses', t)
    expect(lines[0]).toBe('1 hypotheses')
    expect(lines[1]).toBe('h-1: log-transform the target')
  })

  it('shows the engineer plan and metrics', () => {
    const lines = stageSummary(round, 'engineer', t)
    expect(lines).toContain('Plan: Added a log transform and kept features/CV fixed.')
    expect(lines).toContain('run r-1 · roc_auc=0.8300')
  })

  it('summarises verifier counts and trust', () => {
    const lines = stageSummary(round, 'verifier', t)
    expect(lines).toContain('1 pass · 0 warn · 0 fail')
    expect(lines).toContain('trust medium')
  })

  it('summarises decide and report', () => {
    expect(stageSummary(round, 'decide', t)).toContain('Chosen r-1 (best_verified_mean)')
    expect(stageSummary(round, 'report', t)).toContain('Report reports/r.md')
    expect(stageSummary(round, 'report', t)).toContain('strict check passed')
  })

  it('caps the summary at three lines', () => {
    expect(stageSummary(round, 'scout', t).length).toBeLessThanOrEqual(3)
  })
})
