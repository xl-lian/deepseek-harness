import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotebookContent } from '../src/client/ResearchLoopView.tsx'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/campaign-types.ts'
import { campaignView, notebookProps } from './campaign-render.client.ts'


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

function render(...rounds: LoopRound[]): string {
  return renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView(rounds))} />)
}

describe('campaign rounds in the notebook', () => {
  it('renders stage summaries on the cards', () => {
    const html = render(round)
    expect(html).toContain('tabular · roc_auc · 1000×42')
    expect(html).toContain('Plan: Added a log transform and kept features/CV fixed.')
    expect(html).toContain('0 failed · 0 warned · 1 passed')
    expect(html).toContain('log-transform the target')
  })

  it('auto-selects the running stage and shows its full detail', () => {
    const html = render(round)
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
        verifier: stage('verifier', 'pending'),
        decide: { ...stage('decide', 'completed'), startedAt: 15, endedAt: 16 },
      },
      decision: undefined,
    }
    const html = render(settled)
    expect(html).toContain('This stage did not run in this round.')
  })

  it('stacks one ring per experiment, round by round, oldest first', () => {
    const experimentStages = (prefix: string): Record<StageId, LoopStage> => ({
      ...stages,
      engineer: stage('engineer', 'completed', ['h-1', 'h-2'].map((key, index) => ({
        id: `${prefix}:e${index}`, label: `engineer-${key}`, role: 'sa-engineer', agent: 'sa-engineer', kind: 'workflow' as const, status: 'completed' as const, startedAt: index, runIds: [`${prefix}-${key}`],
      }))),
      verifier: stage('verifier', 'completed', ['h-1', 'h-2'].map((key, index) => ({
        id: `${prefix}:v${index}`,
        label: `verify-${key}`,
        role: 'sa-verifier',
        agent: 'sa-verifier',
        kind: 'workflow' as const,
        status: 'completed' as const,
        startedAt: 10 + index,
        verdict: key === 'h-1' ? 'fail' as const : 'pass' as const,
        checks: [
          { layer: 'L2', checkId: 'metric.recompute', status: key === 'h-1' ? 'fail' as const : 'pass' as const, severity: 'blocking', summary: 'reported 0.83, recomputed 0.71' },
          { layer: 'L0', checkId: 'files.present', status: 'pass' as const, summary: 'all outputs present' },
        ],
      }))),
    })
    const first: LoopRound = { ...round, id: 'round-1', roundId: 'rd-first', status: 'completed', stages: experimentStages('a'), hypotheses: undefined, decision: undefined }
    const second: LoopRound = { ...round, id: 'round-2', roundId: 'rd-second', status: 'completed', stages: experimentStages('b'), hypotheses: undefined, decision: undefined }
    const html = render(first, second)

    const rings = [...html.matchAll(/aria-label="Loop of (h-\d)"/g)].map(match => match[1])
    expect(rings).toEqual(['h-1', 'h-2', 'h-1', 'h-2'])
    expect(html.indexOf('rd-first')).toBeLessThan(html.indexOf('rd-second'))
    expect(html.match(/class="rlc-ring-node"/g)).toHaveLength(28)
    expect(html).toContain('2 experiments')

    // A settled experiment opens on its Verifier, grouping checks by result.
    const failed = html.indexOf('Failed (1)')
    const passed = html.indexOf('Passed (1)', failed)
    expect(failed).toBeGreaterThan(-1)
    expect(html.slice(failed, passed)).toContain('metric.recompute')
    expect(html.slice(failed, passed)).toContain('blocking')
    expect(html.slice(passed, html.indexOf('</div>', passed))).toContain('files.present')
    expect(html).toContain('Passed (2)')
  })
})
