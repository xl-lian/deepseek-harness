/**
 * @vitest-environment jsdom
 */
/** The notebook, dock, and Chat card render research loop state with notebook links, verdict labels, and evidence classes. */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { installDocumentBrand, NotebookGuideIcon } from '../src/client/brand.tsx'
import { en, zh } from '../src/client/locales.ts'
import { activeStage, experimentRows, formatDuration, paperStageStatus, stageStatus, stopText } from '../src/client/model.ts'
import { CardBody } from '../src/client/ResearchLoopCard.tsx'
import { DockStrip } from '../src/client/ResearchLoopDock.tsx'
import { NotebookContent } from '../src/client/ResearchLoopView.tsx'
import { PaperCardBody, PaperDockStrip, PaperRunSection } from '../src/client/PaperSection.tsx'
import { injectStyles } from '../src/client/styles.ts'
import { NOTEBOOK_THEME_TOKENS } from '../src/client/theme.ts'
import type { PaperRun, ResearchRound, ResearchRun, ResearchView } from '../src/shared/schema.ts'

const t = ((key: keyof typeof en, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), en[key])) as TranslateNS<'researchLoop'>

const settledRound: ResearchRound = {
  number: 1,
  roundId: 'rd-1',
  status: 'completed',
  startedAt: 1_000,
  endedAt: 9_000,
  retrieval: { focuses: 1, passes: 1, enough: true },
  plan: { registered: true, snapshot: '.sa/objects/p' },
  experiments: [{ id: 'e1', title: 'False-positive rate', role: 'confirmatory', outcome: 'ran', verdict: 'supported', confidence: 'high', unresolved: [], runIds: ['run-a'] }],
  members: [
    { seq: 1, label: 'r1-retrieve-search', kind: 'search', status: 'completed', childId: 'c1' },
    { seq: 2, label: 'r1-read-lit', kind: 'read', status: 'completed', focusId: 'lit', childId: 'c2' },
    { seq: 3, label: 'r1-plan', kind: 'plan', status: 'completed' },
    { seq: 4, label: 'r1-build-e1', kind: 'build', status: 'completed', experimentId: 'e1' },
    { seq: 5, label: 'r1-run-e1-1', kind: 'run', status: 'completed', experimentId: 'e1', pass: 1 },
    { seq: 6, label: 'r1-check-e1', kind: 'check', status: 'completed', experimentId: 'e1' },
    { seq: 7, label: 'r1-next-step', kind: 'next', status: 'completed' },
  ],
  decision: 'stop',
  reason: 'answered',
  needsHuman: 'approve network access',
  notes: [],
}

const runningRound: ResearchRound = {
  number: 2,
  status: 'running',
  experiments: [],
  members: [{ seq: 8, label: 'r2-read-x', kind: 'read', status: 'running', focusId: 'x' }],
  notes: [],
}

function view(runs: ResearchRun[]): ResearchView {
  return {
    v: 5,
    runs,
    papers: [],
    campaign: { rounds: [] },
    agentPreset: 'research',
    skillLoaded: true,
    ledger: {
      time: 1,
      workspace: '/ws/study',
      question: 'Is the t-test calibrated?',
      sources: 3,
      citations: 2,
      rounds: [{
        roundId: 'rd-1',
        experiments: [{
          id: 'e1', runs: ['run-a', 'run-b'], evidenceClass: 'exploratory', demotedBy: ['code changed after run run-a finished'], flags: [],
          objections: [{ id: 'o1', status: 'open', summary: 'seed reuse' }],
        }],
      }],
    },
  }
}

const settledRun: ResearchRun = {
  runId: 'wf-1', workspace: '/ws/study', status: 'completed', startedAt: 1_000, endedAt: 9_000, rounds: [settledRound],
  stop: { reason: 'decided', detail: 'answered' }, answer: 'Yes, within its interval.', notes: [],
}

const noop = (): void => undefined
const retainChild = (): SessionReference => { throw new Error('static rendering retains no child Session') }

const paperRun: PaperRun = {
  runId: 'wf-p', workspace: '/ws/study', status: 'completed', startedAt: 1_000, endedAt: 9_000,
  title: 'False-positive rate at n = 5',
  sections: [{ id: 'results', status: 'written', words: 380 }],
  items: [
    { id: 'rates-table', kind: 'table', status: 'ready', reason: 'rates with intervals' },
    { id: 'curve', kind: 'figure', status: 'blocked', reason: 'no run recorded other sizes' },
  ],
  references: { entries: 2, missing: ['e-00aa11'] },
  audits: [{ pass: 1, blocking: 2, minor: 1, numbers: 14, citations: 9 }, { pass: 2, blocking: 1, minor: 0, numbers: 14, citations: 8 }],
  review: { recommendation: 'minor-revision', summary: 'clear but overclaims once' },
  revisions: 1,
  compile: { status: 'ok', pages: 6, pdf: 'paper/build/main.pdf' },
  open: [{ id: 'a7', section: 'results', blocking: true, summary: 'still overclaims' }],
  members: [{ seq: 1, label: 'paper-outline', kind: 'outline', status: 'completed', childId: 'c-1' }],
  stop: { reason: 'finished' },
  notes: [],
}

describe('research notebook', () => {
  it('derives stage status, experiment rows, and durations', () => {
    expect(stageStatus(settledRound, 'validate')).toBe('completed')
    expect(stageStatus(runningRound, 'retrieve')).toBe('running')
    expect(stageStatus(runningRound, 'plan')).toBe('pending')
    expect(activeStage(runningRound)).toBe('retrieve')
    const [row] = experimentRows(settledRound, view([settledRun]).ledger?.rounds[0])
    expect(row?.attempts).toEqual([['build', 1], ['run', 1], ['check', 1]])
    expect(row?.ledger?.evidenceClass).toBe('exploratory')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(stopText(settledRun)).toBe('decided')
    expect(stopText({ ...settledRun, stop: { reason: 'hard-limit', detail: 'max_rounds' } })).toBe('hard-limit — max_rounds')
  })

  it('renders notebook links, reading, plan, experiments with evidence class, and the write-up', () => {
    const opened: string[] = []
    const html = renderToStaticMarkup(
      <NotebookContent view={view([settledRun])} sessionId={'s-1' as SessionId} openChild={noop} openFile={(_session, path) => { opened.push(path) }} retainChild={retainChild} t={t} />,
    )
    for (const text of ['Is the t-test calibrated?', 'State of knowledge', 'Next-step plan', '3 sources · 2 quote-checked citations',
      'Focus lit', 'Judged enough to plan', 'Registered before any run', 'False-positive rate', 'Supported', 'high confidence',
      'Exploratory evidence', 'Open: o1', 'run-a', 'run-b', 'Needs you: approve network access', 'Yes, within its interval.', 'Open report']) {
      expect(html, text).toContain(text)
    }
    expect(html).toContain('title="runs/run-a/logs/stdout.log"')
    expect(html).toContain('title="research/rounds/01/retrieval/lit.md"')
  })

  it('offers to open the notebook beside Chat only where a handler is given', () => {
    const props = { view: view([settledRun]), sessionId: 's-1' as SessionId, openChild: noop, openFile: noop, retainChild, t }
    expect(renderToStaticMarkup(<NotebookContent {...props} openBeside={noop} />)).toContain('Open beside chat')
    expect(renderToStaticMarkup(<NotebookContent {...props} />)).not.toContain('Open beside chat')
    const icon = renderToStaticMarkup(<NotebookGuideIcon />)
    expect(icon).toContain('aria-hidden="true"')
    expect(icon).toContain('width="20"')
  })

  it('states why the notebook is empty', () => {
    const empty = { v: 5 as const, runs: [], papers: [], campaign: { rounds: [] }, agentPreset: 'science', skillLoaded: false }
    expect(renderToStaticMarkup(<NotebookContent view={empty} sessionId={'s-1' as SessionId} openChild={noop} openFile={noop} retainChild={retainChild} t={t} />))
      .toContain('does not run the Research Agent preset')
  })

  it('shows the dock only while a run is live, and a card per run', () => {
    const live: ResearchRun = { runId: 'wf-2', status: 'running', startedAt: 1_000, rounds: [runningRound], notes: [] }
    const dock = renderToStaticMarkup(<DockStrip view={view([settledRun, live])} openNotebook={noop} t={t} />)
    expect(dock).toContain('Round 2')
    expect(dock).toContain('Open notebook')
    expect(renderToStaticMarkup(<DockStrip view={view([settledRun])} openNotebook={noop} t={t} />)).toBe('')
    const card = renderToStaticMarkup(<CardBody view={view([settledRun])} runId="wf-1" openNotebook={noop} t={t} />)
    expect(card).toContain('Supported')
    expect(card).toContain('Exploratory evidence')
    expect(renderToStaticMarkup(<CardBody view={view([settledRun])} runId="other" openNotebook={noop} t={t} />)).toBe('')
  })

  it('renders a paper run with its files, items, audit, open issues, review, and PDF', () => {
    const opened: string[] = []
    const html = renderToStaticMarkup(
      <PaperRunSection run={paperRun} index={0} openPath={(path) => { opened.push(path) }} openChild={noop} t={t} />,
    )
    for (const text of ['Paper draft 1', 'False-positive rate at n = 5', 'PDF built, 6 pages', 'results', '380 words',
      'rates-table', 'Blocked — no run recorded other sizes', '2 bibliography entries from the ledger', 'Not citable: e-00aa11',
      'Pass 1: 2 blocking, 1 minor', '14 numbers and 8 citations checked', 'Revision passes: 1', 'still overclaims', 'Minor revision']) {
      expect(html, text).toContain(text)
    }
    expect(html).toContain('title="paper/build/main.pdf"')
    expect(html).toContain('title="paper/sections/results.tex"')
    expect(html).toContain('title="paper/tables/rates-table.tex"')
    expect(html).not.toContain('title="paper/figures/curve.tex"')
    expect(paperStageStatus(paperRun, 'compile')).toBe('completed')
    expect(paperStageStatus({ ...paperRun, compile: { status: 'failed', detail: 'x' } }, 'compile')).toBe('failed')
  })

  it('shows the paper dock only while a paper run is live, and a card per paper run', () => {
    const live: PaperRun = { ...paperRun, runId: 'wf-p2', status: 'running', phase: 'Draft', compile: undefined, members: [
      { seq: 1, label: 'paper-section-results', kind: 'section', status: 'running', target: 'results' },
    ] }
    const withPapers = (papers: PaperRun[]): ResearchView => ({ ...view([]), papers })
    expect(renderToStaticMarkup(<PaperDockStrip view={withPapers([paperRun, live])} openNotebook={noop} t={t} />)).toContain('Draft')
    expect(renderToStaticMarkup(<PaperDockStrip view={withPapers([paperRun])} openNotebook={noop} t={t} />)).toBe('')
    const card = renderToStaticMarkup(<PaperCardBody view={withPapers([paperRun])} runId="wf-p" openNotebook={noop} t={t} />)
    expect(card).toContain('False-positive rate at n = 5')
    expect(card).toContain('Pass 2: 1 blocking, 0 minor')
    expect(renderToStaticMarkup(<PaperCardBody view={withPapers([paperRun])} runId="other" openNotebook={noop} t={t} />)).toBe('')
    const notebook = renderToStaticMarkup(<NotebookContent view={withPapers([paperRun])} sessionId={'s-1' as SessionId} openChild={noop} openFile={noop} retainChild={retainChild} t={t} />)
    expect(notebook).toContain('Paper draft 1')
    expect(notebook).not.toContain('does not run the Research Agent preset')
  })

  it('keeps both dictionaries complete and both theme modes distinct', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const base = NOTEBOOK_THEME_TOKENS['--dsw-alias-bg-base']
    expect(base?.light).not.toBe(base?.dark)
  })

  it('removes its styles and restores the document title and icon on dispose', () => {
    document.title = 'App'
    const icon = Object.assign(document.createElement('link'), { rel: 'icon', href: 'https://example.test/a.png' })
    document.head.append(icon)
    const disposeStyles = injectStyles()
    const disposeBrand = installDocumentBrand('Science Agent · Research')
    expect(document.title).toBe('App · Science Agent · Research')
    expect(document.querySelectorAll('style[data-research-loop-styles]')).toHaveLength(1)
    disposeStyles()
    disposeBrand()
    expect(document.querySelectorAll('style[data-research-loop-styles]')).toHaveLength(0)
    expect(document.title).toBe('App')
    expect(icon.getAttribute('href')).toBe('https://example.test/a.png')
  })
})
