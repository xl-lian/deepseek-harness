/** The synced paper-writing workflow runs under dsh's script globals, embeds every node persona, and narrates for the Notebook. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PAPER_NODE_NAMES } from '../scripts/sync.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const script = readFileSync(resolve(root, 'synced/workflows/paper-writing.js'), 'utf8')
const meta = JSON.parse(readFileSync(resolve(root, 'synced/workflows/paper-writing.meta.json'), 'utf8')) as {
  name: string
  phases: { title: string }[]
}

type Value = Record<string, unknown>

const COMPILED = { compiled: true, reason: null, pdf: 'paper/build/main.pdf', pages: 6, errors: [], warnings: [], log: 'paper/build/main.log' }

/** Node and clerk replies by label for one run that needs a revision and a LaTeX fix. */
const REPLIES: Readonly<Record<string, Value>> = {
  'paper-setup': { ok: true, data: { tectonic: 'Tectonic 0.15.0', files: {} } },
  'paper-outline': {
    title: 'False-positive rate of the t-test at n = 5',
    thesis: 'The rate is close to 5%.',
    items: [
      { id: 'Rates Table', kind: 'table', title: 'Estimated rates', section: 'results' },
      { id: 'curve', kind: 'figure', title: 'Rate by sample size', section: 'results' },
      { id: 'extra', kind: 'figure', title: 'Beyond the cap', section: 'results' },
    ],
    summary: 'one finding',
  },
  'paper-references': { entries: 2, keys: ['dewinter2013', 'omelka-notes'], missing: ['e-00aa11'], summary: 'two sources' },
  'paper-item-rates-table': { id: 'rates-table', status: 'ready', path: 'paper/tables/rates-table.tex', reason: 'rates with intervals' },
  'paper-item-curve': { id: 'curve', status: 'blocked', reason: 'no run recorded other sample sizes' },
  'paper-section-introduction': { id: 'introduction', words: 310, summary: 'question' },
  'paper-section-related-work': { id: 'related-work', words: 240, summary: 'prior work' },
  'paper-section-methods': { id: 'methods', words: 420, summary: 'design' },
  'paper-section-results': { id: 'results', words: 380, summary: 'rate' },
  'paper-section-discussion': { id: 'discussion', words: 300, summary: 'limits' },
  'paper-section-abstract': { id: 'abstract', words: 150, summary: 'abstract' },
  'paper-section-conclusion': { id: 'conclusion', words: 120, summary: 'answer' },
  'paper-check-1': { ok: true, data: { problems: [{ kind: 'undefined-citation', file: 'paper/sections/methods.tex', section: 'methods', detail: 'smith2020' }] } },
  'paper-audit-1': {
    issues: [{ id: 'a1', section: 'results', blocking: true, summary: 'exploratory result stated as established', fix: 'mark it exploratory' }],
    numbers_checked: 14,
    citations_checked: 9,
    summary: 'one overclaim',
  },
  'paper-review': {
    issues: [{ id: 'r1', section: 'tables/rates-table', blocking: false, summary: 'caption lacks the replication count' }],
    recommendation: 'minor-revision',
    summary: 'clear but overclaims once',
  },
  'paper-revise-methods-1': { id: 'methods', resolved: ['c1'], unresolved: [], summary: 'removed the citation' },
  'paper-revise-results-1': { id: 'results', resolved: ['a1'], unresolved: [], summary: 'marked exploratory' },
  'paper-revise-assets-1': { id: 'assets', resolved: ['r1'], unresolved: [], summary: 'caption fixed' },
  'paper-check-2': { ok: true, data: { problems: [] } },
  'paper-audit-2': { issues: [], numbers_checked: 14, citations_checked: 8, summary: 'clean' },
  'paper-compile-1': { ok: true, data: { compiled: false, reason: 'latex-errors', errors: ['error: sections/results.tex:12: Misplaced alignment tab character &'], warnings: [] } },
  'paper-fix-1': { fixed: true, summary: 'escaped an ampersand in results' },
  'paper-compile-2': { ok: true, data: COMPILED },
}

interface Trace {
  readonly logs: string[]
  readonly artifacts: string[]
  readonly metrics: string[]
  readonly labels: string[]
  readonly prompts: Map<string, string>
}

async function runPaper(args: Value, overrides: Readonly<Record<string, Value | null>> = {}): Promise<{ result: Value; trace: Trace }> {
  const trace: Trace = { logs: [], artifacts: [], metrics: [], labels: [], prompts: new Map() }
  const table = { ...REPLIES, ...overrides }
  const hooks: Record<string, unknown> = {
    args,
    phase: () => undefined,
    log: (line: string) => { trace.logs.push(line) },
    artifact: (path: string, description: string) => { trace.artifacts.push(`${path} | ${description}`) },
    metric: (name: string, value: number, options: { step: number }) => { trace.metrics.push(`${name}=${value}@${options.step}`) },
    agent: async (prompt: string, options: { label: string }) => {
      const { label } = options
      trace.labels.push(label)
      trace.prompts.set(label, prompt)
      expect(Object.keys(options).sort(), label).toEqual(['label', 'phase', 'schema'])
      expect(prompt.indexOf('\n\n---\n\n'), label).toBeGreaterThan(0)
      const reply = table[label]
      if (reply === undefined) throw new Error(`no reply for ${label}`)
      return reply
    },
    parallel: async (thunks: (() => Promise<unknown>)[]) => Promise.all(thunks.map(async thunk => thunk())),
  }
  // oxlint-disable-next-line typescript/no-implied-eval -- runs the shipped workflow body the way the workflow runtime does
  const run = new Function(...Object.keys(hooks), `return (async () => {\n${script}\n})()`) as (...values: unknown[]) => Promise<Value>
  return { result: await run(...Object.values(hooks)), trace }
}

const ARGS = { workspace: '/ws', authors: 'A. Researcher', maxItems: 2 }

describe('saved paper-writing workflow', () => {
  it('keeps the meta phases and embeds every node persona once', () => {
    expect(meta.name).toBe('paper-writing')
    expect(meta.phases.map(phase => phase.title)).toEqual(['Setup', 'Outline', 'Figures', 'Draft', 'Audit', 'Revise', 'Compile'])
    expect(script.split('const PERSONAS = {')).toHaveLength(2)
    for (const name of PAPER_NODE_NAMES) expect(script, name).toContain(`  ${JSON.stringify(name)}: "Runtime mapping (DeepSeek Harness):`)
    expect(script).toContain('You are one node of a running paper-writing workflow.')
    expect(script).not.toMatch(/export const meta|agentType|typeOf\(|effort:/u)
  })

  it('drafts, revises what the audit blocks, repairs LaTeX, and reports the built paper', async () => {
    const { result, trace } = await runPaper(ARGS)
    expect(trace.labels).toEqual([
      'paper-setup', 'paper-outline', 'paper-references', 'paper-item-rates-table', 'paper-item-curve',
      'paper-section-introduction', 'paper-section-related-work', 'paper-section-methods', 'paper-section-results', 'paper-section-discussion',
      'paper-section-abstract', 'paper-section-conclusion',
      'paper-check-1', 'paper-audit-1', 'paper-review',
      'paper-revise-methods-1', 'paper-revise-results-1', 'paper-revise-assets-1',
      'paper-check-2', 'paper-audit-2',
      'paper-compile-1', 'paper-fix-1', 'paper-compile-2',
    ])
    expect(trace.prompts.get('paper-setup')).toContain('sagent -w "/ws" paper init --json')
    expect(trace.prompts.get('paper-outline')).toContain('sagent -w "/ws" paper prompt paper-outline')
    expect(trace.prompts.get('paper-outline')).toContain('Authors: A. Researcher')
    expect(trace.prompts.get('paper-section-results')).toContain('\\input{tables/rates-table} · label tab:rates-table')
    expect(trace.prompts.get('paper-section-results')).not.toContain('curve')
    expect(trace.prompts.get('paper-section-abstract')).toContain('Sections already written: paper/sections/introduction.tex')
    expect(trace.prompts.get('paper-revise-methods-1')).toContain('- c1 (blocking): undefined-citation in paper/sections/methods.tex: smith2020')
    expect(trace.logs).toEqual([
      'Paper files: paper/',
      'Paper outline: 1 item(s) beyond maxItems not built: extra.',
      'Paper: False-positive rate of the t-test at n = 5',
      'Paper outline: 7 section(s), 2 figure and table item(s)',
      'Paper references: 2 entries · not citable: e-00aa11',
      'Paper item rates-table: table ready — rates with intervals',
      'Paper item curve: figure blocked — no run recorded other sample sizes',
      'Paper section introduction: 310 words',
      'Paper section related-work: 240 words',
      'Paper section methods: 420 words',
      'Paper section results: 380 words',
      'Paper section discussion: 300 words',
      'Paper section abstract: 150 words',
      'Paper section conclusion: 120 words',
      'Paper audit pass 1: 2 blocking, 1 minor · numbers 14, citations 9',
      'Paper review: minor-revision — clear but overclaims once',
      'Paper revise pass 1: 3 part(s), 3 of 3 issue(s) resolved',
      'Paper audit pass 2: 0 blocking, 0 minor · numbers 14, citations 8',
      'Paper compile: ok · 6 page(s) · paper/build/main.pdf',
    ])
    expect(trace.artifacts).toEqual(expect.arrayContaining([
      'paper/outline.md | paper outline', 'paper/tables/rates-table.tex | table rates-table', 'paper/sections/results.tex | section results',
      'paper/audit.md | audit pass 2', 'paper/review.md | review', 'paper/build/main.pdf | paper PDF',
    ]))
    expect(trace.artifacts.some(line => line.includes('curve'))).toBe(false)
    expect(trace.metrics).toEqual(['blocking_issues=2@1', 'issues=3@1', 'blocking_issues=0@2', 'issues=0@2'])
    expect(result).toMatchObject({
      started: true,
      paper: { title: 'False-positive rate of the t-test at n = 5', tex: 'paper/main.tex', pdf: 'paper/build/main.pdf', pages: 6 },
      references: { entries: 2, missing: ['e-00aa11'] },
      audit: { passes: 2, revisions: 1, blocking: 0, minor: 0, numbers_checked: 14, citations_checked: 8 },
      review: { recommendation: 'minor-revision' },
      compile: { compiled: true },
      stop: { reason: 'finished' },
    })
    expect((result.items as Value[]).map(item => `${String(item.id)}:${String(item.status)}`)).toEqual(['rates-table:ready', 'curve:blocked'])
    expect((result.sections as Value[]).every(section => section.status === 'written')).toBe(true)
  })

  it('keeps blocking issues open at the revision limit and skips the PDF without Tectonic', async () => {
    const { result, trace } = await runPaper({ ...ARGS, maxRevisions: 1 }, {
      'paper-audit-2': { issues: [{ id: 'a7', section: 'results', blocking: true, summary: 'still overclaims' }], summary: 'one left' },
      'paper-compile-1': { ok: true, data: { compiled: false, reason: 'no-tectonic', install: 'brew install tectonic', errors: [], warnings: [] } },
    })
    expect(trace.labels.filter(label => label.startsWith('paper-revise-'))).toHaveLength(3)
    expect(trace.labels.some(label => label.startsWith('paper-fix-'))).toBe(false)
    expect(trace.logs.at(-1)).toBe('Paper compile: skipped — Tectonic is not installed (brew install tectonic)')
    expect(result.audit).toMatchObject({ passes: 2, revisions: 1, blocking: 1, open: [{ id: 'a7', section: 'results', blocking: true }] })
    expect(result.compile).toMatchObject({ compiled: false, reason: 'no-tectonic', install: 'brew install tectonic' })
    expect(String(result.next)).toContain('1 blocking issue(s) remain open')
  })

  it('refuses to start without its arguments or a research record', async () => {
    expect((await runPaper({ authors: 'A. Researcher' })).result).toMatchObject({ started: false, reason: 'missing-args' })
    const { result, trace } = await runPaper(ARGS, { 'paper-setup': { ok: false, error: { code: 'NO_RESEARCH', message: 'run the research loop first' } } })
    expect(result).toMatchObject({ started: false, reason: 'setup-failed' })
    expect(String(result.error)).toContain('NO_RESEARCH')
    expect(trace.labels).toEqual(['paper-setup'])
  })

  it('reports a node failure as a stopped run with what was written', async () => {
    const { result, trace } = await runPaper(ARGS, { 'paper-outline': null })
    expect(result).toMatchObject({ started: true, stop: { reason: 'workflow-error', detail: 'the outline node returned nothing' }, compile: null })
    expect(trace.logs.at(-1)).toBe('Paper stopped: workflow-error — the outline node returned nothing')
  })
})
