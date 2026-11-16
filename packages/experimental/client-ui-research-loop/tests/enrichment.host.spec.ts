import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { describe, expect, it } from 'vitest'
import { initCampaignState, reduceCampaignEvent } from '../src/projection/campaign.ts'
import type { CampaignState } from '../src/shared/campaign-types.ts'

import { event } from './session-events.ts'

function run(events: readonly SessionEvent[]): CampaignState {
  return events.reduce(reduceCampaignEvent, initCampaignState())
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

function workflowResult(callId: string, payload: unknown): SessionEvent {
  const text = `workflow "kaggle-round" completed (3 agents).\nReturn value:\n${JSON.stringify(payload, null, 2)}`
  return event('tool/result', {
    turn: 1,
    step: 1,
    message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text }], isError: false },
  })
}

function bashCall(callId: string, command: string): SessionEvent {
  return event('tool/call', {
    turn: 1,
    step: 1,
    callId,
    name: 'bash',
    arguments: JSON.stringify({ command }),
  })
}

function jsonResult(callId: string, payload: unknown, text = JSON.stringify(payload)): SessionEvent {
  return event('tool/result', {
    turn: 1,
    step: 1,
    message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text }], isError: false },
  })
}

const enrichedReturn = {
  started: true,
  roundId: 'rd-1',
  mode: 'full',
  scout: {
    status: 'ok',
    summary: 'tabular binary classification',
    metric: 'roc_auc',
    task_type: 'tabular',
    rows_train: 1000,
    columns: 42,
    cv_recommendation: { strategy: 'stratified-kfold', group_column: null, time_column: null, reason: 'balanced' },
    baseline_present: false,
    risks: ['id leakage'],
    evidence_cards: [{ source_type: 'discussion', url: 'https://example.test', claim: 'use CV', support: 'for' }],
  },
  hypotheses: [{
    hypothesis_id: 'h-1',
    experiment_id: 'x-1',
    statement: 'log-transform the target',
    falsifiable_prediction: '+0.01 auc',
    rationale: 'skewed target',
    design: 'same features and CV',
    seeds: [42, 43],
    expected_delta: 0.01,
    cost: 'low',
    leakage_risk: 'low',
    cv_design: 'stratified-kfold',
  }],
  results: [{
    hypothesis_id: 'h-1',
    experiment_id: 'x-1',
    engineer: {
      status: 'ok',
      run_ids: ['r-1', 'r-2'],
      metrics: { reported: { metric_name: 'roc_auc', value: 0.83 } },
      notes: 'stable across seeds',
      plan: 'Added a log transform and kept features/CV fixed.',
      files: ['experiments/rd-1/h-1/main.py'],
      repaired: false,
      error: null,
    },
    verify: {
      run_id: 'r-1',
      run_ids: ['r-1', 'r-2'],
      verdict: 'pass',
      trust: 'medium',
      blocking_failures: [],
      warnings: ['single sandbox profile'],
      repairable: false,
      summary: 'L2 recomputation matches the reported mean.',
      metrics_verified: { metric_name: 'roc_auc', value: 0.83 },
      checks: [
        { layer: 'L2', check_id: 'metric.recompute', status: 'pass', severity: 'blocking', summary: 'reported=0.83' },
      ],
    },
    repair: null,
    reverify: null,
  }],
  l3: { round_summary: 'stable across seeds', seed_variance: 'low', multiple_comparisons: '3 lenses', budget_fairness: 'ok', notes: '' },
}

describe('enriched workflow results', () => {
  it('keeps engineer plan/files/metrics when verification ran', () => {
    const state = run([
      workflowCall('call-1'),
      event('tool-workflow/run-start', { runId: 'run-1', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-1', seq: 1, label: 'scout', phase: 'Scout', childId: 'c-1' }),
      event('tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }),
      event('tool-workflow/agent-start', { runId: 'run-1', seq: 2, label: 'engineer-h-1', phase: 'Implement & Execute', childId: 'c-2' }),
      event('tool-workflow/agent-end', { runId: 'run-1', seq: 2, outcome: 'completed' }),
      event('tool-workflow/agent-start', { runId: 'run-1', seq: 3, label: 'verify-h-1', phase: 'Verify', childId: 'c-3' }),
      event('tool-workflow/agent-end', { runId: 'run-1', seq: 3, outcome: 'completed' }),
      event('tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }),
      workflowResult('call-1', enrichedReturn),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    const round = state.rounds[0]!
    const engineer = round.stages.engineer.members.find(member => member.label === 'engineer-h-1')!
    expect(engineer.plan).toBe('Added a log transform and kept features/CV fixed.')
    expect(engineer.files).toEqual(['experiments/rd-1/h-1/main.py'])
    expect(engineer.runIds).toEqual(['r-1', 'r-2'])
    expect(engineer.metrics).toEqual({ roc_auc: 0.83 })
    expect(engineer.summary).toBe('Added a log transform and kept features/CV fixed.')

    const verifier = round.stages.verifier.members.find(member => member.label === 'verify-h-1')!
    expect(verifier.verdict).toBe('pass')
    expect(verifier.trust).toBe('medium')
    expect(verifier.checks?.[0]?.checkId).toBe('metric.recompute')
    expect(verifier.metricsVerified).toEqual({ roc_auc: 0.83 })
    expect(verifier.runIds).toEqual(['r-1', 'r-2'])
    expect(round.stages.verifier.verdict).toBe('pass')

    expect(round.scout?.cv?.strategy).toBe('stratified-kfold')
    expect(round.scout?.evidence[0]?.claim).toBe('use CV')
    expect(round.hypotheses?.[0]?.prediction).toBe('+0.01 auc')
    expect(round.hypotheses?.[0]?.design).toBe('same features and CV')
    expect(round.hypotheses?.[0]?.seeds).toEqual([42, 43])
    expect(round.status).toBe('completed')
  })

  it('keeps the repaired chain and reports pass after reverify', () => {
    const payload = {
      started: true,
      roundId: 'rd-2',
      mode: 'full',
      scout: { status: 'ok', summary: 's', metric: 'auc', task_type: 'tabular', risks: [], evidence_cards: [] },
      hypotheses: [{ hypothesis_id: 'h-2', experiment_id: 'x-2', statement: 'x' }],
      results: [{
        hypothesis_id: 'h-2',
        engineer: { status: 'failed', run_ids: [], notes: 'crash', plan: 'first try', files: [], repaired: false, error: 'code error' },
        verify: { run_id: 'r-9', verdict: 'fail', trust: 'low', repairable: true, summary: 'L1 failed', blocking_failures: ['exit code 1'], warnings: [], checks: [] },
        repair: { status: 'ok', run_ids: ['r-10'], notes: 'fixed', plan: 'fixed dtype', files: ['a.py'], repaired: true, error: null },
        reverify: { run_id: 'r-10', verdict: 'pass', trust: 'medium', repairable: false, summary: 'ok now', blocking_failures: [], warnings: [], checks: [] },
      }],
      l3: null,
    }
    const state = run([
      workflowCall('call-2', 'rd-2'),
      event('tool-workflow/run-start', { runId: 'run-2', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-2', seq: 1, label: 'engineer-h-2', phase: 'Implement & Execute', childId: 'c-1' }),
      event('tool-workflow/agent-end', { runId: 'run-2', seq: 1, outcome: 'failed' }),
      event('tool-workflow/agent-start', { runId: 'run-2', seq: 2, label: 'verify-h-2', phase: 'Verify', childId: 'c-2' }),
      event('tool-workflow/agent-end', { runId: 'run-2', seq: 2, outcome: 'completed' }),
      event('tool-workflow/agent-start', { runId: 'run-2', seq: 3, label: 'repair-h-2', phase: 'Implement & Execute', childId: 'c-3' }),
      event('tool-workflow/agent-end', { runId: 'run-2', seq: 3, outcome: 'completed' }),
      event('tool-workflow/agent-start', { runId: 'run-2', seq: 4, label: 'reverify-h-2', phase: 'Verify', childId: 'c-4' }),
      event('tool-workflow/agent-end', { runId: 'run-2', seq: 4, outcome: 'completed' }),
      event('tool-workflow/run-end', { runId: 'run-2', stopReason: 'completed' }),
      workflowResult('call-2', payload),
    ])
    const round = state.rounds[0]!
    expect(round.stages.verifier.verdict).toBe('pass')
    expect(round.stages.verifier.members.map(member => member.verdict)).toEqual(['fail', 'pass'])
    expect(round.stages.engineer.members.find(member => member.label === 'repair-h-2')?.repaired).toBe(true)
  })

  it('settles stages the workflow deliberately skipped (reused scout, skipped L3)', () => {
    const state = run([
      workflowCall('call-5', 'rd-5'),
      event('tool-workflow/run-start', { runId: 'run-5', name: 'kaggle-round' }),
      event('tool-workflow/run-end', { runId: 'run-5', stopReason: 'completed' }),
      workflowResult('call-5', {
        started: true,
        roundId: 'rd-5',
        mode: 'quick',
        scout: { status: 'ok', summary: 'cached', metric: 'auc', task_type: 'tabular', risks: [], evidence_cards: [] },
        hypotheses: [],
        results: [],
        l3: null,
        l3Skipped: 'quick mode runs one candidate',
        scoutReused: true,
      }),
    ])
    const round = state.rounds[0]!
    expect(round.stages.scout.status).toBe('completed')
    expect(round.stages.scout.summary).toContain('reused')
    expect(round.stages.statistician.status).toBe('completed')
    expect(round.stages.statistician.summary).toContain('quick mode')
  })

  it('maps a blocked workflow with scout context', () => {
    const state = run([
      workflowCall('call-3', 'rd-3'),
      event('tool-workflow/run-start', { runId: 'run-3', name: 'kaggle-round' }),
      workflowResult('call-3', {
        started: false,
        reason: 'scout-blocked',
        scout: { status: 'blocked', summary: 'data not frozen', metric: 'auc', task_type: 'tabular', risks: ['frozen data missing'], evidence_cards: [] },
      }),
    ])
    const round = state.rounds[0]!
    expect(round.status).toBe('blocked')
    expect(round.workflow?.error).toBe('scout-blocked')
    expect(round.scout?.summary).toBe('data not frozen')
  })
})

describe('CLI payload shapes', () => {
  it('maps run execute manifests with reported metrics', () => {
    const state = run([
      bashCall('call-run', 'sagent -w /ws run execute --code x --seeds 42,43 --json'),
      jsonResult('call-run', {
        ok: true,
        data: {
          runs: [
            { run_id: 'r-a', status: 'finished', metrics: { reported: { metric_name: 'roc_auc', value: 0.8 } } },
            { run_id: 'r-b', status: 'finished', metrics: { reported: { metric_name: 'roc_auc', value: 0.82 } } },
          ],
        },
      }),
    ])
    const member = state.rounds[0]!.stages.engineer.members[0]!
    expect(member.runIds).toEqual(['r-a', 'r-b'])
    expect(member.metrics).toEqual({ roc_auc: 0.82 })
    expect(member.status).toBe('completed')
  })

  it('maps a verify run verdict with checks and trust', () => {
    const state = run([
      bashCall('call-verify', 'sagent -w /ws verify run r-1 --levels L0,L1,L2 --json'),
      jsonResult('call-verify', {
        ok: true,
        data: {
          run_id: 'r-1',
          verdict: 'warn',
          trust: 'medium',
          checks: [
            { layer: 'L2', check_id: 'metric.recompute', status: 'warn', severity: 'minor', summary: 'close to reported' },
            { layer: 'L0', check_id: 'provenance', status: 'pass', severity: 'blocking', summary: 'ok' },
          ],
          metrics_verified: { metric_name: 'roc_auc', value: 0.81 },
        },
      }),
    ])
    const member = state.rounds[0]!.stages.verifier.members[0]!
    expect(member.verdict).toBe('warn')
    expect(member.trust).toBe('medium')
    expect(member.checks).toHaveLength(2)
    expect(member.metricsVerified).toEqual({ roc_auc: 0.81 })
    expect(member.runIds).toEqual(['r-1'])
  })

  it('maps verify design into the statistician stage', () => {
    const state = run([
      bashCall('call-design', 'sagent -w /ws verify design --round rd-1 --json'),
      jsonResult('call-design', {
        ok: true,
        data: {
          round_id: 'rd-1',
          verified_runs: [{ run_id: 'r-1', label: 'a', value: 0.83, seed: 42 }],
          best: { run_id: 'r-1', label: 'a', value: 0.83, seed: 42 },
          baseline_run_id: 'r-0',
          baseline_value: 0.8,
          delta_vs_baseline: 0.03,
          multiple_comparisons: 3,
        },
      }),
    ])
    const round = state.rounds[0]!
    expect(round.design?.best?.runId).toBe('r-1')
    expect(round.design?.delta).toBe(0.03)
    expect(round.stages.statistician.summary).toContain('best r-1')
  })

  it('zips chained decide + report build + report check payloads', () => {
    const text = [
      JSON.stringify({ ok: true, data: { chosen_run_id: 'r-1', rationale_code: 'best_verified_mean', eliminated: [], candidates: [{ run_id: 'r-1', verified_mean: 0.83, rank: 1 }], budget_used: { runs: 2 } } }),
      JSON.stringify({ ok: true, data: { path: 'reports/r.md', checks: { ok: true, strict: true, issues: [{ line: 3, token: '0.83', text: 'unsourced' }] } } }),
      JSON.stringify({ ok: true, data: { ok: true, strict: true, issues: [], path: 'reports/r.md' } }),
    ].join('\n')
    const state = run([
      bashCall('call-chain', 'sagent -w /ws decide --round rd-1 --json && sagent -w /ws report build --round rd-1 --json && sagent -w /ws report check reports/r.md --strict --json'),
      jsonResult('call-chain', undefined, text),
    ])
    const round = state.rounds[0]!
    expect(round.decision?.chosenRunId).toBe('r-1')
    expect(round.decision?.candidates[0]?.runId).toBe('r-1')
    expect(round.report?.path).toBe('reports/r.md')
    expect(round.report?.ok).toBe(true)
    expect(round.report?.issues).toHaveLength(0)
    expect(round.stages.decide.status).toBe('completed')
    expect(round.stages.report.status).toBe('completed')
  })

  it('records round stage summaries from the CLI payload', () => {
    const state = run([
      bashCall('call-stage', 'sagent -w /ws round stage rd-1 scout --json'),
      jsonResult('call-stage', { ok: true, data: { name: 'scout', status: 'running', summary: 'profiling data' } }),
    ])
    const round = state.rounds[0]!
    expect(round.stages.scout.summary).toBe('profiling data')
    expect(round.stages.scout.status).toBe('running')
  })

  it('creates a new round for every round begin', () => {
    const state = run([
      bashCall('rb-1', 'sagent -w /ws round begin --mode quick --json'),
      jsonResult('rb-1', { ok: true, data: { round_id: 'rd-1', mode: 'quick' } }),
      bashCall('rb-2', 'sagent -w /ws round begin --mode quick --json'),
      jsonResult('rb-2', { ok: true, data: { round_id: 'rd-2', mode: 'quick' } }),
    ])
    expect(state.rounds.map(round => round.roundId)).toEqual(['rd-1', 'rd-2'])
  })

  it('applies a background workflow return delivered through job output', () => {
    const payload = {
      started: true,
      roundId: 'rd-bg',
      mode: 'quick',
      scout: {
        status: 'ok',
        summary: 'bg scout',
        metric: 'rmse',
        task_type: 'regression',
        risks: [],
        evidence_cards: [],
      },
      hypotheses: [{ hypothesis_id: 'h-bg', experiment_id: 'x-bg', statement: 'bg hypothesis' }],
      results: [{
        hypothesis_id: 'h-bg',
        engineer: {
          status: 'ok',
          run_ids: ['r-bg'],
          metrics: { metric_name: 'rmse', value: 0.01 },
          notes: 'n',
          plan: 'bg plan',
          files: ['a.py'],
          repaired: false,
          error: null,
        },
        verify: null,
        repair: null,
        reverify: null,
      }],
      l3: { round_summary: 'bg l3', seed_variance: 'low', multiple_comparisons: '1', budget_fairness: 'ok', notes: '' },
    }
    const text = `workflow "kaggle-round" completed (1 agent).\nReturn value:\n${JSON.stringify(payload)}\n[status: completed, 1 agents]`
    const state = run([
      bashCall('rb-bg', 'sagent -w /ws round begin --mode quick --json'),
      jsonResult('rb-bg', { ok: true, data: { round_id: 'rd-bg', mode: 'quick' } }),
      workflowCall('wc-bg', 'rd-bg'),
      event('tool-workflow/run-start', { runId: 'run-bg', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-bg', seq: 1, label: 'engineer-h-bg', phase: 'Implement & Execute', childId: 'c-bg' }),
      event('tool-workflow/agent-end', { runId: 'run-bg', seq: 1, outcome: 'completed' }),
      event('tool-workflow/run-end', { runId: 'run-bg', stopReason: 'completed' }),
      event('tool/call', { turn: 1, step: 1, callId: 'job-1', name: 'job_output', arguments: JSON.stringify({ job_id: 'workflow-1' }) }),
      event('tool/result', {
        turn: 1,
        step: 1,
        message: {
          role: 'tool',
          source: { kind: 'tool', callId: 'job-1' },
          toolCallId: 'job-1',
          content: [{ type: 'text', text }],
          isError: false,
        },
      }),
    ])
    const round = state.rounds[0]!
    expect(round.roundId).toBe('rd-bg')
    expect(round.scout?.summary).toBe('bg scout')
    expect(round.hypotheses?.[0]?.statement).toBe('bg hypothesis')
    expect(round.stages.engineer.members[0]?.plan).toBe('bg plan')
    expect(round.l3?.roundSummary).toBe('bg l3')
  })

  it('drops the placeholder round when round begin fails', () => {
    const state = run([
      bashCall('rb-bad', 'sagent -w /ws round begin --mode quick --json'),
      jsonResult('rb-bad', { ok: false, error: { code: 'INTERNAL', message: 'Operation not permitted' } }),
    ])
    expect(state.rounds).toHaveLength(0)
  })

  it('does not re-settle a pruned duplicate tool result', () => {
    const first = run([
      bashCall('call-dup', 'sagent -w /ws data profile --json'),
      jsonResult('call-dup', { ok: true, data: { summary: 'first', rows_sampled: 10 } }),
    ])
    const second = reduceCampaignEvent(first, jsonResult('call-dup', { ok: true, data: { summary: 'second' } }))
    expect(second).toBe(first)
  })
})

describe('round status', () => {
  it('keeps a finished round completed when one optional hypothesis lens failed', () => {
    const state = run([
      workflowCall('call-r1', 'rd-r1'),
      event('tool-workflow/run-start', { runId: 'run-r1', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-r1', seq: 1, label: 'hypothesis-0', phase: 'Hypotheses', childId: 'c-1' }),
      event('tool-workflow/agent-end', { runId: 'run-r1', seq: 1, outcome: 'failed' }),
      event('tool-workflow/agent-start', { runId: 'run-r1', seq: 2, label: 'hypothesis-1', phase: 'Hypotheses', childId: 'c-2' }),
      event('tool-workflow/agent-end', { runId: 'run-r1', seq: 2, outcome: 'completed' }),
      event('tool-workflow/run-end', { runId: 'run-r1', stopReason: 'error' }),
      bashCall('call-r1-end', 'sagent -w /ws round end rd-r1 --outcome no_change --json 2>&1 | python3 -c "print(1)"'),
      jsonResult('call-r1-end', undefined, 'round: rd-r1 | outcome: no_change'),
    ])
    const round = state.rounds[0]!
    expect(round.workflow?.stopReason).toBe('error')
    expect(round.stages.hypotheses.status).toBe('failed')
    expect(round.status).toBe('completed')
  })

  it('marks a round failed when the workflow errored and no round end was recorded', () => {
    const state = run([
      workflowCall('call-r3', 'rd-r3'),
      event('tool-workflow/run-start', { runId: 'run-r3', name: 'kaggle-round' }),
      event('tool-workflow/agent-start', { runId: 'run-r3', seq: 1, label: 'hypothesis-0', phase: 'Hypotheses', childId: 'c-3' }),
      event('tool-workflow/agent-end', { runId: 'run-r3', seq: 1, outcome: 'failed' }),
      event('tool-workflow/run-end', { runId: 'run-r3', stopReason: 'error' }),
    ])
    expect(state.rounds[0]!.status).toBe('failed')
  })

  it('maps a failed round outcome to failed', () => {
    const state = run([
      workflowCall('call-r2', 'rd-r2'),
      event('tool-workflow/run-start', { runId: 'run-r2', name: 'kaggle-round' }),
      bashCall('call-r2-end', 'sagent -w /ws round end rd-r2 --outcome failed --json'),
      jsonResult('call-r2-end', { ok: true, data: { round_id: 'rd-r2', outcome: 'failed' } }),
    ])
    expect(state.rounds[0]!.status).toBe('failed')
  })
})
