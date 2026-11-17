/** The synced workflows run under dsh's script globals and keep the results the loop view reads. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const workflow = (name: string): string => readFileSync(resolve(root, 'synced/workflows', name), 'utf8')
const pack: unknown = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/science-agent/predictive.json'), 'utf8'))

interface AgentOptions {
  label?: string
}

type Json = Record<string, unknown>

function proposal(index: number): Json {
  return {
    statement: `strategy ${index}`, rationale: 'because', falsifiable_prediction: '+0.01 auc', design: 'same features',
    expected_delta: 0.01, cost: 'low', leakage_risk: 'low', features: 'x', model_family: 'lgbm', cv_design: 'kfold',
    parent_run_id: '', novelty_vs_prior: 'new',
  }
}

function runResult(id: string, repaired: boolean): Json {
  return {
    status: 'ok', run_ids: [`r-${id}`], metrics: { metric_name: 'roc_auc', value: 0.8 },
    notes: `note ${id}`, plan: `plan ${id}`, files: [`experiments/${id}/main.py`], repaired, error: null,
  }
}

function verifyResult(id: string, verdict: 'pass' | 'fail', repairable: boolean): Json {
  return {
    run_id: `r-${id}`, run_ids: [`r-${id}`], verdict, trust: 'medium',
    blocking_failures: verdict === 'fail' ? ['exit 1'] : [], warnings: [], repairable, summary: `summary ${id}`,
    metrics_verified: { metric_name: 'roc_auc', value: 0.8 },
    checks: [{ layer: 'L2', check_id: 'metric.recompute', status: verdict, severity: 'blocking', summary: 'check' }],
  }
}

function campaignCheck(stop: boolean, mode: string): Json {
  return {
    campaign_id: 'cp-1', stop, fired: stop ? [{ rule: 'max_rounds' }] : [], next_mode: mode,
    mode_reason: 'r', next_actions: { policy: 'tree', actions: [] }, briefing: {}, rounds: { max: 2 },
  }
}

/** A deterministic stand-in for every `agent()` call the round and campaign make, keyed by label. */
function stubAgent(): (prompt: string, options?: AgentOptions) => Promise<Json> {
  let closes = 0
  return async (prompt, options) => {
    const label = options?.label ?? ''
    if (!prompt.includes('---')) throw new Error(`persona missing for ${label}`)
    if (label === 'domain') return { ok: true, data: pack }
    if (label === 'doctor') return { ok: true, data: { ok: true } }
    if (label === 'campaign-begin') return { ok: true, data: { campaign_id: 'cp-1' } }
    if (label === 'check-0') return { ok: true, data: campaignCheck(false, 'full') }
    if (label.startsWith('round-begin-')) return { ok: true, data: { round_id: `rd-${label.slice(12)}` } }
    if (label.startsWith('round-close-')) {
      closes += 1
      return {
        ok: true,
        data: {
          round_id: /round close (\S+)/u.exec(prompt)?.[1], outcome: 'improved', best_run_id: 'r-h0', delta: 0.01,
          report: { path: '/r.md', strict_ok: true }, campaign: campaignCheck(closes >= 2, 'full'),
        },
      }
    }
    if (label === 'campaign-end') return { ok: true, data: { status: 'ended' } }
    if (label === 'summary') return { summary: 's', best_verified: {}, negative_results: [], uncertainties: [], next_action: 'stop' }
    if (label === 'scout') {
      return {
        status: 'ok', summary: 'data', metric: 'roc_auc', task_type: 'tabular', rows_train: 10, columns: 3,
        cv_recommendation: { strategy: 'kfold', reason: 'r', group_column: '', time_column: '' }, baseline_present: false,
        risks: ['leak'], evidence_cards: [], prior: {},
      }
    }
    if (label.startsWith('hypothesis-')) return { hypotheses: [proposal(Number(label.slice('hypothesis-'.length)))] }
    if (label === 'register') {
      const items = JSON.parse(prompt.split("<<'SA_JSON'\n")[1]!.split('\nSA_JSON')[0]!) as { seeds?: unknown }[]
      const records = items.map((h, i) => ({ index: i, hypothesis_id: `h${i}`, experiment_id: `x${i}`, seeds: h.seeds ?? null }))
      return { ok: true, data: prompt.includes('--select') ? { selected: records, deferred: [] } : records }
    }
    if (label === 'promote') return { ok: true, data: { promoted: [{ key: 'x0', hypothesis_ids: ['h0'], delta: 0.01 }], not_promoted: [] } }
    if (label.startsWith('confirm-')) return runResult(label, false)
    if (label.startsWith('engineer-')) return runResult(label.slice('engineer-'.length), false)
    if (label.startsWith('repair-')) return runResult(label.slice('repair-'.length), true)
    if (label.startsWith('reverify-')) return verifyResult(label.slice('reverify-'.length), 'pass', false)
    if (label.startsWith('verify-')) {
      const id = label.slice('verify-'.length)
      return id === 'h1' ? verifyResult(id, 'fail', true) : verifyResult(id, 'pass', false)
    }
    if (label === 'l3-design') {
      return { round_summary: 'ok', seed_variance: 'low', multiple_comparisons: '3', budget_fairness: 'ok', stop_recommended: false, notes: '' }
    }
    if (label === 'ensemble') return { ok: true, data: { built: false, reason: 'one candidate on the frozen folds' } }
    if (label === 'submit-select') return { ok: true, data: { primary_run_id: 'r-h0', secondary_run_id: null } }
    throw new Error(`unexpected label ${label}`)
  }
}

interface Recorded {
  metrics: { name: string; value: number; step: number | undefined }[]
  artifacts: { path: string; description: string }[]
}

/** Run a workflow body with the dsh script globals, the way the workflow runtime does. */
async function run(name: string, args: Json): Promise<{ result: Json; recorded: Recorded }> {
  const recorded: Recorded = { metrics: [], artifacts: [] }
  const globals = {
    args,
    phase: (): void => {},
    log: (): void => {},
    agent: stubAgent(),
    parallel: async (thunks: (() => Promise<unknown>)[]) => Promise.all(thunks.map(thunk => thunk())),
    pipeline: async (items: unknown[], ...stages: ((value: unknown, item: unknown, index: number) => Promise<unknown>)[]) =>
      Promise.all(items.map(async (item, index) => {
        let value = item
        for (const stage of stages) value = await stage(value, item, index)
        return value
      })),
    metric: (metricName: string, value: number, options?: { step?: number }): void => {
      recorded.metrics.push({ name: metricName, value, step: options?.step })
    },
    artifact: (path: string, description: string): void => {
      recorded.artifacts.push({ path, description })
    },
  }
  // oxlint-disable-next-line typescript/no-implied-eval -- runs the shipped workflow body the way the workflow runtime does
  const body = new Function(...Object.keys(globals), `return (async () => {${workflow(`${name}.js`)}})()`) as
    (...values: unknown[]) => Promise<Json>
  const result = await body(...Object.values(globals))
  const serialized = JSON.stringify(result, (key, value: unknown) => {
    if (value === undefined) throw new Error(`undefined at ${key}`)
    return value
  })
  expect(serialized.length).toBeLessThan(45_000)
  return { result: JSON.parse(serialized) as Json, recorded }
}

describe('synced science-agent workflows', () => {
  it('carry no Claude Code-only options and embed personas once', () => {
    for (const name of ['science-round', 'science-campaign', 'kaggle-round']) {
      const source = workflow(`${name}.js`)
      expect(source).not.toContain('export const meta')
      expect(source).not.toMatch(/^\s*agentType:/mu)
      expect(source).not.toMatch(/^\s*effort:/mu)
      expect(source).not.toContain('type: [')
      expect(source.split('const PERSONAS = {')).toHaveLength(2)
      const meta = JSON.parse(workflow(`${name}.meta.json`)) as { name: string; phases: unknown[] }
      expect(meta.name).toBe(name)
      expect(meta.phases.length).toBeGreaterThan(0)
    }
    const round = workflow('science-round.js')
    expect(round.split('withPersona(').length - 1).toBe(9)
    expect(round).not.toContain('metric(')
    expect(round).not.toContain('artifact(')
    const campaign = workflow('science-campaign.js')
    expect(campaign).toContain("metric('round_delta'")
    expect(campaign).toContain('artifact(c.report.path')
    expect(campaign).not.toContain('await workflow(')
    const titles = (name: string): string[] =>
      (JSON.parse(workflow(`${name}.meta.json`)) as { phases: { title: string }[] }).phases.map(phase => phase.title)
    expect(titles('science-campaign')).toEqual(['Preflight', 'Plan', 'Round', 'Close', 'Wrap-up'])
    expect(titles('science-round')).toEqual(['Scout', 'Hypotheses', 'Select', 'Implement & Execute', 'Verify'])
  })

  it('accumulates per-hypothesis stage results in one round', async () => {
    const { result } = await run('science-round', { workspace: '/ws', roundId: 'rd-1', maxRuns: 6 })
    expect(result.started).toBe(true)
    expect(result.tokenDelta).toBeNull()
    const hypotheses = result.hypotheses as Json[]
    expect(hypotheses[0]?.falsifiable_prediction).toBe('+0.01 auc')
    const byId = new Map((result.results as Json[]).map(item => [item.hypothesis_id, item]))
    expect(byId.get('h0')).toMatchObject({
      engineer: { plan: 'plan h0' },
      verify: { checks: [{ check_id: 'metric.recompute' }] },
      confirm: { run_ids: ['r-confirm-h0'] },
      confirm_verify: { verdict: 'pass' },
    })
    expect(byId.get('h1')).toMatchObject({
      verify: { verdict: 'fail' },
      repair: { repaired: true },
      reverify: { verdict: 'pass' },
    })
  })

  it('runs inlined rounds until a stop rule and records round metrics and reports', async () => {
    const { result, recorded } = await run('science-campaign', { workspace: '/ws', roundArgs: { maxRuns: 6 } })
    expect(result.started).toBe(true)
    const rounds = result.rounds as Json[]
    expect(rounds.map(round => round.round_id)).toEqual(['rd-1', 'rd-2'])
    expect(rounds.every(round => round.started === true)).toBe(true)
    expect((result.stop as Json).reason).toBe('stop-rule')
    expect(recorded.metrics.filter(entry => entry.name === 'round_delta')).toEqual([
      { name: 'round_delta', value: 0.01, step: 0 },
      { name: 'round_delta', value: 0.01, step: 1 },
    ])
    expect(recorded.metrics.filter(entry => entry.name === 'candidates').map(entry => entry.step)).toEqual([0, 1])
    expect(recorded.artifacts).toEqual([
      { path: '/r.md', description: 'Round 1 report (rd-1)' },
      { path: '/r.md', description: 'Round 2 report (rd-2)' },
    ])
  })
})
