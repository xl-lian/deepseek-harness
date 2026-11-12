import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ScienceLoopView, type ScienceLoopViewProps } from '../src/client/ScienceLoopView.tsx'
import { en } from '../src/client/locales.ts'
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
  files: ['experiments/rd-1/h-1/main.py'],
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
  checks: [{ layer: 'L2', checkId: 'metric.recompute', status: 'pass', summary: 'reported=0.83' }],
}])

const round: LoopRound = {
  id: 'round-1',
  roundId: 'rd-arch',
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
    design: 'same features and CV',
    seeds: [42, 43],
  }],
  decision: {
    chosenRunId: 'r-1',
    rationaleCode: 'best_verified_mean',
    eliminated: [],
    candidates: [{ runId: 'r-1', verifiedMean: 0.83, seeds: 2, rank: 1 }],
  },
  report: { path: 'reports/r.md', ok: true, strict: true, issues: [] },
}

function props(value: LoopRound): ScienceLoopViewProps {
  return {
    sessionId: 'session-1',
    useProjection: () => ({ v: 1, rounds: [value], activeRoundId: value.id }),
    openSession: () => {},
    openFile: () => {},
    t,
  } as unknown as ScienceLoopViewProps
}

describe('ScienceLoopView enrichment', () => {
  it('renders stage summaries on the cards', () => {
    const html = renderToStaticMarkup(<ScienceLoopView {...props(round)} />)
    expect(html).toContain('tabular · roc_auc · 1000×42')
    expect(html).toContain('Plan: Added a log transform and kept features/CV fixed.')
    expect(html).toContain('1 pass · 0 warn · 0 fail')
    expect(html).toContain('h-1: log-transform the target')
  })

  it('auto-selects the running stage and shows its full detail', () => {
    const html = renderToStaticMarkup(<ScienceLoopView {...props(round)} />)
    expect(html).toContain('Implementation plan')
    expect(html).toContain('Added a log transform and kept features/CV fixed.')
    expect(html).toContain('experiments/rd-1/h-1/main.py')
    expect(html).toContain('roc_auc=0.8300')
  })

  it('shows an idle stage message for a settled round', () => {
    const settled: LoopRound = {
      ...round,
      status: 'completed',
      endedAt: 20,
      stages: {
        ...round.stages,
        engineer: stage('engineer', 'completed', round.stages.engineer.members.map(member => ({
          ...member, status: 'completed', endedAt: 10,
        }))),
        decide: { ...stage('decide', 'completed'), startedAt: 15, endedAt: 16 },
      },
      decision: undefined,
    }
    const html = renderToStaticMarkup(<ScienceLoopView {...props(settled)} />)
    expect(html).toContain('This stage did not run in this round.')
  })
})
