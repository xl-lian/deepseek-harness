/** The synced research loop runs under dsh's script globals, embeds node personas, and narrates rounds for the loop view. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const script = readFileSync(resolve(root, 'synced/workflows/research-loop.js'), 'utf8')
const meta = JSON.parse(readFileSync(resolve(root, 'synced/workflows/research-loop.meta.json'), 'utf8')) as {
  name: string
  phases: { title: string }[]
}

type Value = Record<string, unknown>

const FILES = {
  question: 'research/question.md',
  guidance: 'research/guidance.md',
  state: 'research/state.md',
  next_plan: 'research/plan.md',
  report: 'research/report.md',
  round_dir: 'research/rounds/01',
  retrieval_dir: 'research/rounds/01/retrieval',
  round_plan: 'research/rounds/01/plan.md',
  experiments_dir: 'research/rounds/01/experiments',
  validation_dir: 'research/rounds/01/validation',
  previous_round_dir: null,
}

/** Node and clerk replies by label; `register` decides whether the plan registration succeeds. */
function replies(register: boolean): Readonly<Record<string, Value>> {
  return {
    'open-1': { ok: true, data: { stop: false, fired: [], reused: false, round_id: 'rd-1', number: 1, files: FILES } },
    'r1-retrieve-search': { focuses: [{ id: 'f1', question: 'what is known', why: 'scope' }], reason: 'one gap' },
    'r1-read-f1': { focus_id: 'f1', summary: 'read', sources: 2, citations: 1 },
    'r1-retrieve-refine-1': { enough: true, focuses: [], summary: 'enough' },
    'r1-plan': {
      experiments: [{ id: 'e1', title: 'Warmup "range"', role: 'confirmatory' }, { id: 'e2', title: 'Curvature', role: 'exploratory' }],
      summary: 'two tests',
    },
    'r1-save-plan': register
      ? { ok: true, data: { plan: { cas_path: '.sa/objects/p', sha256: 'abcdef0123456789', experiments: ['e1'] } } }
      : { ok: false, error: { code: 'STATE', message: 'plan file missing' } },
    'r1-build-e1': { status: 'ready', code_dir: 'code', seeds: [0, 1], reason: 'built' },
    'r1-run-e1-1': { ran: true, run_ids: ['run-a', 'run-b'] },
    'r1-check-e1': { verdict: 'supported', confidence: 'high', summary: 'holds' },
    'r1-challenge-e1-1': { objections: [{ id: 'o1', blocking: false, summary: 'minor' }], summary: 'no blocker' },
    'r1-save-e1': { ok: true, data: { saved: ['r1-build-e1'] } },
    'r1-next-step': { decision: 'stop', reason: 'question answered', needs_human: 'approve network', summary: 'done' },
    'r1-save-next': { ok: true, data: { saved: ['r1-next-step'] } },
    'close-1': { ok: true, data: { next_round_allowed: false } },
    'write-up': { report_markdown: '# Report', answer: 'Warmup widens the stable range.' },
  }
}

interface Trace {
  readonly logs: string[]
  readonly artifacts: string[]
  readonly metrics: string[]
  readonly labels: string[]
}

async function runLoop(register: boolean): Promise<{ result: Value; trace: Trace }> {
  const trace: Trace = { logs: [], artifacts: [], metrics: [], labels: [] }
  const table = replies(register)
  const hooks: Record<string, unknown> = {
    args: { workspace: '/ws', maxRounds: 2, maxExperiments: 1 },
    phase: () => undefined,
    log: (line: string) => { trace.logs.push(line) },
    artifact: (path: string, description: string) => { trace.artifacts.push(`${path} | ${description}`) },
    metric: (name: string, value: number, options: { step: number }) => { trace.metrics.push(`${name}=${value}@${options.step}`) },
    agent: async (prompt: string, options: { label: string; schema?: unknown; agentType?: unknown; effort?: unknown }) => {
      const { label } = options
      trace.labels.push(label)
      expect(Object.keys(options).sort(), label).toEqual(['label', 'phase', 'schema'])
      expect(prompt.indexOf('\n\n---\n\n'), label).toBeGreaterThan(0)
      const reply = table[label]
      if (reply === undefined) throw new Error(`no reply for ${label}`)
      return reply
    },
    parallel: async (thunks: (() => Promise<unknown>)[]) => Promise.all(thunks.map(async thunk => thunk())),
    pipeline: async (items: unknown[], ...stages: ((value: unknown, item: unknown, index: number) => Promise<unknown>)[]) =>
      Promise.all(items.map(async (item, index) => stages.reduce<Promise<unknown>>(
        async (value, stage) => stage(await value, item, index),
        Promise.resolve(item),
      ))),
  }
  // oxlint-disable-next-line typescript/no-implied-eval -- runs the shipped workflow body the way the workflow runtime does
  const run = new Function(...Object.keys(hooks), `return (async () => {\n${script}\n})()`) as (...values: unknown[]) => Promise<Value>
  return { result: await run(...Object.values(hooks)), trace }
}

describe('synced research loop workflow', () => {
  it('keeps the meta phases and embeds every node persona once', () => {
    expect(meta.name).toBe('research-loop')
    expect(meta.phases.map(phase => phase.title)).toEqual(['Open', 'Retrieve', 'Plan', 'Experiment', 'Validate', 'Next step', 'Write-up'])
    expect(script).not.toContain('export const meta')
    expect(script.split('const PERSONAS = {')).toHaveLength(2)
    expect(script).not.toMatch(/pattern:|agentType|typeOf\(/u)
  })

  it('runs a registered round through write-up and narrates each step', async () => {
    const { result, trace } = await runLoop(true)
    expect(result.started).toBe(true)
    expect(result.stop).toEqual({ reason: 'decided', detail: 'question answered' })
    const round = (result.rounds as Value[])[0]
    expect(round).toMatchObject({ round_id: 'rd-1', decision: 'stop', registered_plan: '.sa/objects/p', needs_human: 'approve network' })
    expect(round?.experiments).toEqual([
      { id: 'e1', status: 'ran', verdict: 'supported', confidence: 'high', unresolved: [], run_ids: ['run-a', 'run-b'], reason: null },
    ])
    expect(trace.logs).toEqual(expect.arrayContaining([
      'Round 1 (rd-1).',
      'Round 1 reading: 1 focus note(s), 1 pass(es), enough',
      'Round 1 plan: registered · e1 "Warmup \\"range\\"" [confirmatory] · e2 "Curvature" [exploratory]',
      'Round 1 e1: supported (high) · runs run-a, run-b',
      'Round 1 next step: stop — question answered',
      'Round 1 needs a human: approve network',
      'Loop stopped: decided — question answered',
      'Write-up: Warmup widens the stable range.',
    ]))
    expect(trace.artifacts).toEqual([
      'research/rounds/01/retrieval/coverage.md | round 1 coverage',
      'research/rounds/01/plan.md | round 1 plan',
      'research/rounds/01/validation/e1.md | round 1 validation e1',
      'research/state.md | round 1 state of knowledge',
      'research/plan.md | round 1 next-step plan',
    ])
    expect(trace.metrics).toEqual(['experiments_validated=1@1', 'supported=1@1'])
    expect(trace.labels.at(-1)).toBe('write-up')
    expect(round?.not_run_by_cap).toEqual(['e2'])
    expect(trace.labels.some(label => label.startsWith('r1-build-e2'))).toBe(false)
  })

  it('runs no experiment when the plan cannot be registered', async () => {
    const { result, trace } = await runLoop(false)
    expect(trace.labels.some(label => label.startsWith('r1-build-'))).toBe(false)
    expect((result.rounds as Value[])[0]?.registration_error).toContain('plan file missing')
    expect(trace.logs.some(line => line.startsWith('Round 1 plan: not registered — '))).toBe(true)
    expect(trace.metrics).toEqual(['experiments_validated=0@1', 'supported=0@1'])
  })
})
