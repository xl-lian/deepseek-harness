/** The paper fold turns a `paper-writing` run into sections, items, audit passes, a compile result, and open issues. */

import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { describe, expect, it } from 'vitest'
import { researchLoopProjection, toResearchView } from '../src/projection/definition.ts'
import { initResearchState, reduceResearchEvent } from '../src/projection/reduce.ts'
import { parsePaperLabel, parsePaperLine } from '../src/shared/paper-labels.ts'
import type { ResearchState } from '../src/shared/schema.ts'
import { call, event, result, undefinedPaths, workflowEvents } from './session-events.ts'

const { start, end, log } = workflowEvents('wf-p')

function fold(events: readonly SessionEvent[], from: ResearchState = initResearchState('research')): ResearchState {
  return events.reduce(reduceResearchEvent, from)
}

const paperReturn = {
  started: true,
  paper: { title: 'False-positive rate at n = 5', tex: 'paper/main.tex', pdf: 'paper/build/main.pdf', pages: 6 },
  references: { entries: 2, missing: ['e-00aa11'] },
  audit: { passes: 2, revisions: 1, blocking: 1, minor: 0, open: [{ id: 'a7', section: 'results', blocking: true, summary: 'still overclaims', fix: '' }] },
  stop: { reason: 'finished', detail: null },
}

const launch = [
  call('c-paper', 'workflow', { name: 'paper-writing', args: { workspace: '/ws/study', kitDir: '/kit' } }),
  event('tool-workflow/run-start', { runId: 'wf-p', name: 'paper-writing' }),
]

describe('paper labels and narration', () => {
  it('parses member labels into kind, target, and pass', () => {
    expect(parsePaperLabel('paper-outline')).toEqual({ kind: 'outline' })
    expect(parsePaperLabel('paper-section-related-work')).toEqual({ kind: 'section', target: 'related-work' })
    expect(parsePaperLabel('paper-item-rates-table')).toEqual({ kind: 'item', target: 'rates-table' })
    expect(parsePaperLabel('paper-revise-related-work-2')).toEqual({ kind: 'revise', target: 'related-work', pass: 2 })
    expect(parsePaperLabel('paper-compile-3')).toEqual({ kind: 'compile', pass: 3 })
    expect(parsePaperLabel('r1-plan')).toBeUndefined()
    expect(parsePaperLabel('paper-unknown')).toBeUndefined()
  })

  it('parses the narration grammar and leaves other lines alone', () => {
    expect(parsePaperLine('Paper: Paper compile: a study')).toEqual({ kind: 'title', title: 'Paper compile: a study' })
    expect(parsePaperLine('Paper references: 1 entry')).toEqual({ kind: 'references', entries: 1, missing: [] })
    expect(parsePaperLine('Paper item curve: figure blocked — no data')).toEqual({ kind: 'item', id: 'curve', item: 'figure', status: 'blocked', reason: 'no data' })
    expect(parsePaperLine('Paper section results: failed — the section node returned nothing')).toEqual({ kind: 'section', id: 'results', written: false })
    expect(parsePaperLine('Paper audit pass 1: 2 blocking, 1 minor · the audit node returned nothing'))
      .toEqual({ kind: 'audit', pass: 1, blocking: 2, minor: 1 })
    expect(parsePaperLine('Paper compile: skipped — Tectonic is not installed (brew install tectonic)'))
      .toEqual({ kind: 'compile', status: 'skipped', detail: 'Tectonic is not installed (brew install tectonic)' })
    expect(parsePaperLine('Paper outline: 7 section(s), 2 figure and table item(s)')).toBeUndefined()
    expect(parsePaperLine('Round 1 (rd-1).')).toBeUndefined()
  })
})

describe('paper fold', () => {
  it('follows a run from outline to a built PDF', () => {
    const state = fold([
      ...launch,
      start(1, 'paper-setup'), end(1),
      log('Paper files: paper/'),
      start(2, 'paper-outline'), end(2),
      log('Paper: False-positive rate at n = 5'),
      log('Paper outline: 7 section(s), 2 figure and table item(s)'),
      start(3, 'paper-references'), start(4, 'paper-item-rates-table'), end(3), end(4),
      log('Paper references: 2 entries · not citable: e-00aa11'),
      log('Paper item rates-table: table ready — rates with intervals'),
      start(5, 'paper-section-results'), end(5),
      log('Paper section results: 380 words'),
      start(6, 'paper-audit-1'), end(6),
      log('Paper audit pass 1: 2 blocking, 1 minor · numbers 14, citations 9'),
      log('Paper review: minor-revision — clear but overclaims once'),
      start(7, 'paper-revise-results-1'), end(7, 'failed'),
      log('Paper revise pass 1: 3 part(s), 3 of 3 issue(s) resolved'),
      log('Paper audit pass 2: 1 blocking, 0 minor · numbers 14, citations 8'),
      start(8, 'paper-compile-1'),
      log('Paper compile: ok · 6 page(s) · paper/build/main.pdf'),
      event('tool-workflow/run-end', { runId: 'wf-p', stopReason: 'completed' }),
      result('c-paper', `Workflow finished.\nReturn value:\n${JSON.stringify(paperReturn)}`),
    ])
    expect(state.runs).toEqual([])
    expect(state.calls).toEqual({})
    const [paper] = state.papers
    expect(paper).toMatchObject({
      runId: 'wf-p', callId: 'c-paper', workspace: '/ws/study', status: 'completed', title: 'False-positive rate at n = 5',
      sections: [{ id: 'results', status: 'written', words: 380 }],
      items: [{ id: 'rates-table', kind: 'table', status: 'ready', reason: 'rates with intervals' }],
      references: { entries: 2, missing: ['e-00aa11'] },
      audits: [
        { pass: 1, blocking: 2, minor: 1, numbers: 14, citations: 9 },
        { pass: 2, blocking: 1, minor: 0, numbers: 14, citations: 8 },
      ],
      review: { recommendation: 'minor-revision', summary: 'clear but overclaims once' },
      revisions: 1,
      compile: { status: 'ok', pages: 6, pdf: 'paper/build/main.pdf' },
      open: [{ id: 'a7', section: 'results', blocking: true, summary: 'still overclaims' }],
      stop: { reason: 'finished' },
      notes: ['Paper files: paper/', 'Paper outline: 7 section(s), 2 figure and table item(s)'],
    })
    expect(paper?.members.map(member => `${member.kind}:${member.target ?? ''}:${member.status}`)).toEqual([
      'setup::completed', 'outline::completed', 'references::completed', 'item:rates-table:completed', 'section:results:completed',
      'audit::completed', 'revise:results:failed', 'compile::completed',
    ])
    const view = toResearchView(state)
    expect(undefinedPaths(view)).toEqual([])
    expect(researchLoopProjection.wire.viewSchema.parse(view)).toEqual(view)
    expect(researchLoopProjection.stateSchema.parse(state)).toEqual(state)
  })

  it('keeps research loop events and unrelated events out of paper runs, and the reverse', () => {
    const base = fold(launch)
    for (const unrelated of [
      event('tool-workflow/run-start', { runId: 'wf-other', name: 'something-else' }),
      event('tool-workflow/agent-start', { runId: 'wf-other', seq: 1, label: 'paper-outline', childId: 'c' }),
      event('tool-workflow/log', { runId: 'wf-other', message: 'Paper: not this run' }),
      start(1, 'r1-plan'),
      result('c-unknown', '{}'),
    ]) expect(reduceResearchEvent(base, unrelated)).toBe(base)
    const both = fold([
      call('c-loop', 'workflow', { name: 'research-loop', args: { workspace: '/ws/study' } }),
      event('tool-workflow/run-start', { runId: 'wf-1', name: 'research-loop' }),
    ], base)
    expect(both.runs.map(run => run.callId)).toEqual(['c-loop'])
    expect(both.papers.map(run => run.callId)).toEqual(['c-paper'])
  })

  it('cancels a running paper when the turn is interrupted and fails it when the tool call fails', () => {
    const running = fold([...launch, start(1, 'paper-outline')])
    const interrupted = fold([event('turn/end', { turn: 1, reason: { kind: 'interrupted' } })], running)
    expect(interrupted.papers[0]).toMatchObject({ status: 'cancelled', members: [{ kind: 'outline', status: 'cancelled' }] })
    const failed = fold([event('tool/result', {
      turn: 1,
      step: 1,
      message: { role: 'tool', source: { kind: 'tool', callId: 'c-paper' }, toolCallId: 'c-paper', content: [{ type: 'text', text: 'boom' }], isError: true },
    })], running)
    expect(failed.papers[0]?.status).toBe('failed')
    expect(failed.calls).toEqual({})
  })
})
