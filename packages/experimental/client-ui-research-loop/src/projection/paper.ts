/**
 * Pure fold of `paper-writing` workflow runs: member lifecycle, the workflow's
 * narration lines, and its final return value. It reads only events of runs it
 * started and returns the same state reference for every other event.
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { PAPER_WORKFLOW } from '../shared/constants.ts'
import { parsePaperLabel, parsePaperLine, type ParsedPaperLine } from '../shared/paper-labels.ts'
import type { PaperMember, PaperRun, ResearchState } from '../shared/schema.ts'
import {
  MAX_LIST, SHORT_TEXT, TEXT, clip, compact, isRecord, num, payloadsOf, pushBounded, settled, str, strings, textOf, workflowCall,
} from './fold-util.ts'

const MAX_PAPERS = 10
const MAX_MEMBERS = 120
const MAX_ENTRIES = 24
const MAX_NOTES = 30

/**
 * Paper runs of a new Session.
 * @returns an empty list.
 */
export function initPaperRuns(): PaperRun[] {
  return []
}

/**
 * Fold one committed event into the paper runs.
 * @param state - current state.
 * @param event - the next committed Session event.
 * @returns the next state, or `state` itself when the event concerns no paper run.
 */
export function reducePaperEvent(state: ResearchState, event: SessionEvent): ResearchState {
  switch (event.type) {
    case 'tool/call': {
      const call = workflowCall(event.data.name, event.data.arguments, PAPER_WORKFLOW)
      return call === undefined
        ? state
        : { ...state, calls: { ...state.calls, [event.data.callId]: compact({ purpose: 'paper' as const, workspace: call.workspace }) } }
    }
    case 'tool/result': {
      const { message } = event.data
      return onToolResult(state, message.toolCallId, textOf(message.content), message.isError === true, event.time)
    }
    case 'tool-workflow/run-start':
      return event.data.name === PAPER_WORKFLOW ? onRunStart(state, String(event.data.runId), event.time) : state
    case 'tool-workflow/agent-start':
      return onAgentStart(state, String(event.data.runId), event.data.seq, event.data.label, String(event.data.childId), event.time)
    case 'tool-workflow/agent-end':
      return updatePaper(state, String(event.data.runId), (run) => {
        if (!run.members.some(member => member.seq === event.data.seq)) return run
        const status = settled(event.data.outcome)
        const members = run.members.map(member => (member.seq === event.data.seq ? { ...member, status, endedAt: event.time } : member))
        return { ...run, members }
      })
    case 'tool-workflow/phase':
      return updatePaper(state, String(event.data.runId), run => (
        run.phase === event.data.title ? run : { ...run, phase: event.data.title }
      ))
    case 'tool-workflow/log':
      return updatePaper(state, String(event.data.runId), run => applyLine(run, parsePaperLine(event.data.message), event.data.message))
    case 'tool-workflow/run-end':
      return updatePaper(state, String(event.data.runId), run => endRun(run, event.data.stopReason, event.time))
    case 'turn/end':
      if (event.data.reason.kind !== 'interrupted' && event.data.reason.kind !== 'forked') return state
      if (!state.papers.some(run => run.status === 'running')) return state
      return { ...state, papers: state.papers.map(run => (run.status === 'running' ? endRun(run, 'cancelled', event.time) : run)) }
    default:
      return state
  }
}

function updatePaper(state: ResearchState, runId: string, update: (run: PaperRun) => PaperRun): ResearchState {
  const index = state.papers.findIndex(run => run.runId === runId)
  const current = state.papers[index]
  if (current === undefined) return state
  const updated = update(current)
  if (updated === current) return state
  return { ...state, papers: state.papers.map((run, at) => (at === index ? updated : run)) }
}

function onRunStart(state: ResearchState, runId: string, time: number): ResearchState {
  if (state.papers.some(run => run.runId === runId)) return state
  // A run-start follows its workflow tool call; bind the oldest paper call that has no run yet.
  const bound = new Set(state.papers.map(run => run.callId))
  const entry = Object.entries(state.calls).find(([callId, call]) => call.purpose === 'paper' && !bound.has(callId))
  const run: PaperRun = compact({
    runId,
    callId: entry?.[0],
    workspace: entry?.[1].workspace,
    status: 'running' as const,
    startedAt: time,
    sections: [],
    items: [],
    audits: [],
    revisions: 0,
    open: [],
    members: [],
    notes: [],
  })
  return { ...state, papers: pushBounded(state.papers, run, MAX_PAPERS) }
}

function onAgentStart(state: ResearchState, runId: string, seq: number, label: string, childId: string, time: number): ResearchState {
  return updatePaper(state, runId, (run) => {
    const parsed = parsePaperLabel(label)
    if (parsed === undefined) return run
    const member: PaperMember = compact({
      seq,
      label: clip(label, SHORT_TEXT),
      kind: parsed.kind,
      status: 'running' as const,
      target: parsed.target === undefined ? undefined : clip(parsed.target, SHORT_TEXT),
      pass: parsed.pass,
      childId,
      startedAt: time,
    })
    return { ...run, members: pushBounded(run.members, member, MAX_MEMBERS) }
  })
}

function optionalClip(text: string | undefined, limit: number): string | undefined {
  return text === undefined ? undefined : clip(text, limit)
}

/** Replace the entry with the same key, or append it while the list has room. */
function upsert<T>(list: readonly T[], entry: T, same: (item: T) => boolean): T[] {
  if (list.some(same)) return list.map(item => (same(item) ? entry : item))
  return list.length >= MAX_ENTRIES ? [...list] : [...list, entry]
}

function applyLine(run: PaperRun, line: ParsedPaperLine | undefined, raw: string): PaperRun {
  if (line === undefined) return { ...run, notes: pushBounded(run.notes, clip(raw, TEXT), MAX_NOTES) }
  switch (line.kind) {
    case 'title':
      return { ...run, title: clip(line.title, TEXT) }
    case 'references':
      return { ...run, references: { entries: line.entries, missing: line.missing.slice(0, MAX_LIST).map(id => clip(id, SHORT_TEXT)) } }
    case 'item': {
      const id = clip(line.id, SHORT_TEXT)
      const item = { id, kind: line.item, status: line.status, reason: clip(line.reason, TEXT) }
      return { ...run, items: upsert(run.items, item, entry => entry.id === id) }
    }
    case 'section': {
      const id = clip(line.id, SHORT_TEXT)
      const section = compact({ id, status: line.written ? 'written' as const : 'failed' as const, words: line.words })
      return { ...run, sections: upsert(run.sections, section, item => item.id === id) }
    }
    case 'audit': {
      const { pass, blocking, minor, numbers, citations } = line
      const audit = compact({ pass, blocking, minor, numbers, citations })
      return { ...run, audits: upsert(run.audits, audit, item => item.pass === line.pass) }
    }
    case 'review':
      return { ...run, review: compact({ recommendation: line.recommendation, summary: optionalClip(line.summary, TEXT) }) }
    case 'revise':
      return { ...run, revisions: Math.max(run.revisions, line.pass) }
    case 'compile':
      return {
        ...run,
        compile: compact({
          status: line.status,
          pages: line.pages,
          pdf: optionalClip(line.pdf, SHORT_TEXT),
          detail: optionalClip(line.detail, TEXT),
        }),
      }
    case 'stopped':
      return { ...run, stop: compact({ reason: clip(line.reason, SHORT_TEXT), detail: optionalClip(line.detail, TEXT) }) }
    default: {
      const unhandled: never = line
      return unhandled
    }
  }
}

function endRun(run: PaperRun, stopReason: string, time: number): PaperRun {
  const status = settled(stopReason)
  // Members still running when the run ends never report their own end; they settle with the run.
  const members = run.members.map(member => (member.status === 'running' ? { ...member, status, endedAt: time } : member))
  return { ...run, status, endedAt: time, members }
}

function onToolResult(state: ResearchState, callId: string, text: string, failed: boolean, time: number): ResearchState {
  if (state.calls[callId]?.purpose !== 'paper') return state
  const { [callId]: _settled, ...calls } = state.calls
  const next: ResearchState = { ...state, calls }
  const run = next.papers.find(candidate => candidate.callId === callId)
  if (run === undefined) return next
  const result = failed ? undefined : payloadsOf(text).find(payload => isRecord(payload['paper']) && isRecord(payload['audit']))
  return updatePaper(next, run.runId, current => (result === undefined
    ? (failed && current.status === 'running' ? endRun(current, 'failed', time) : current)
    : applyResult(current, result)))
}

/** The workflow's return value states the open issues, which no narration line carries, and confirms the rest. */
function applyResult(run: PaperRun, result: Record<string, unknown>): PaperRun {
  const paper = isRecord(result['paper']) ? result['paper'] : {}
  const audit = isRecord(result['audit']) ? result['audit'] : {}
  const stop = isRecord(result['stop']) ? result['stop'] : undefined
  const open = (Array.isArray(audit['open']) ? audit['open'] : []).filter(isRecord).slice(0, MAX_ENTRIES).map(issue => ({
    id: str(issue['id'], SHORT_TEXT) ?? '?',
    section: str(issue['section'], SHORT_TEXT) ?? '?',
    blocking: issue['blocking'] === true,
    summary: str(issue['summary']) ?? '',
  }))
  return compact({
    ...run,
    title: str(paper['title']) ?? run.title,
    revisions: num(audit['revisions']) ?? run.revisions,
    open,
    references: isRecord(result['references'])
      ? { entries: num(result['references']['entries']) ?? 0, missing: strings(result['references']['missing']) }
      : run.references,
    stop: stop === undefined ? run.stop : compact({ reason: str(stop['reason'], SHORT_TEXT) ?? 'unknown', detail: str(stop['detail']) }),
  })
}
