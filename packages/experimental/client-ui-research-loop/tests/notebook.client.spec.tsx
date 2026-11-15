/**
 * @vitest-environment jsdom
 */
/** The notebook, dock, and Chat card render research loop state with notebook links, verdict labels, and evidence classes. */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { installDocumentBrand } from '../src/client/brand.tsx'
import { en, zh } from '../src/client/locales.ts'
import { activeStage, experimentRows, formatDuration, stageStatus } from '../src/client/model.ts'
import { CardBody } from '../src/client/ResearchLoopCard.tsx'
import { DockStrip } from '../src/client/ResearchLoopDock.tsx'
import { NotebookContent } from '../src/client/ResearchLoopView.tsx'
import { injectStyles } from '../src/client/styles.ts'
import { NOTEBOOK_THEME_TOKENS } from '../src/client/theme.ts'
import type { ResearchRound, ResearchRun, ResearchView } from '../src/shared/schema.ts'

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
    v: 1,
    runs,
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
  })

  it('renders notebook links, reading, plan, experiments with evidence class, and the write-up', () => {
    const opened: string[] = []
    const html = renderToStaticMarkup(
      <NotebookContent view={view([settledRun])} sessionId={'s-1' as SessionId} openChild={noop} openFile={(_session, path) => { opened.push(path) }} t={t} />,
    )
    for (const text of ['Is the t-test calibrated?', 'State of knowledge', 'Next-step plan', '3 sources · 2 quote-checked citations',
      'Focus lit', 'Judged enough to plan', 'Registered before any run', 'False-positive rate', 'Supported', 'high confidence',
      'Exploratory evidence', 'Open: o1', 'run-a', 'run-b', 'Needs you: approve network access', 'Yes, within its interval.', 'Open report']) {
      expect(html, text).toContain(text)
    }
    expect(html).toContain('title="runs/run-a/logs/stdout.log"')
    expect(html).toContain('title="research/rounds/01/retrieval/lit.md"')
  })

  it('states why the notebook is empty', () => {
    const empty = { v: 1 as const, runs: [], agentPreset: 'science', skillLoaded: false }
    expect(renderToStaticMarkup(<NotebookContent view={empty} sessionId={'s-1' as SessionId} openChild={noop} openFile={noop} t={t} />))
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
