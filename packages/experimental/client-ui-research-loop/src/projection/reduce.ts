/**
 * Pure fold from committed Session events to notebook state. It follows
 * `research-loop` workflow runs (member lifecycle, narration lines, and the
 * final return value) and the latest `sagent research status` result, then
 * hands each event to the paper-writing fold and the campaign-round fold. It
 * performs no I/O and returns the same state reference for unrelated events.
 */

import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { parseLabel, parseLogLine, type ParsedLine } from '../shared/labels.ts'
import {
  MAX_LIST, SHORT_TEXT, TEXT, clip, compact, isRecord, num, parseObject, payloadsOf,
  pushBounded, settled, str, strings, textOf, workflowCall,
} from './fold-util.ts'
import { initCampaignState, reduceCampaignEvent } from './campaign.ts'
import { initPaperRuns, reducePaperEvent } from './paper.ts'
import { RESEARCH_WORKFLOW, SCIENCE_SKILLS } from '../shared/constants.ts'
import {
  verdictSchema,
  type LedgerExperiment,
  type LedgerRound,
  type ResearchExperiment,
  type ResearchLedger,
  type ResearchMember,
  type ResearchRound,
  type ResearchRun,
  type ResearchState,
} from '../shared/schema.ts'

const MAX_RUNS = 20
const MAX_ROUNDS = 30
const MAX_MEMBERS = 160
const MAX_EXPERIMENTS = 20
const MAX_NOTES = 30
const MAX_LEDGER_ROUNDS = 30
const LONG_TEXT = 800

/**
 * Empty state for a Session.
 * @param agentPreset - the Session's initial agent preset, if any.
 * @returns state with no runs.
 */
export function initResearchState(agentPreset: string | null = null): ResearchState {
  return { v: 5, runs: [], papers: initPaperRuns(), campaign: initCampaignState(), calls: {}, agentPreset, skillLoaded: false }
}

/**
 * Fold one committed event.
 * @param state - current state.
 * @param event - the next committed Session event.
 * @returns the next state, or `state` itself when the event is unrelated.
 */
export function reduceResearchEvent(state: ResearchState, event: SessionEvent): ResearchState {
  const next = reducePaperEvent(reduceLoopEvent(state, event), event)
  const campaign = reduceCampaignEvent(next.campaign, event)
  return campaign === next.campaign ? next : { ...next, campaign }
}

function reduceLoopEvent(state: ResearchState, event: SessionEvent): ResearchState {
  switch (event.type) {
    case 'tool/call':
      return onToolCall(state, event.data.callId, event.data.name, event.data.arguments)
    case 'tool/result': {
      const { message } = event.data
      return onToolResult(state, message.toolCallId, textOf(message.content), message.isError === true, event.time)
    }
    case 'tool-workflow/run-start':
      return event.data.name === RESEARCH_WORKFLOW ? onRunStart(state, String(event.data.runId), event.time) : state
    case 'tool-workflow/agent-start':
      return onAgentStart(state, String(event.data.runId), event.data.seq, event.data.label, String(event.data.childId), event.time)
    case 'tool-workflow/agent-end':
      return onAgentEnd(state, String(event.data.runId), event.data.seq, event.data.outcome, event.time)
    case 'tool-workflow/phase':
      return updateRun(state, String(event.data.runId), run => (run.phase === event.data.title ? run : { ...run, phase: event.data.title }))
    case 'tool-workflow/log':
      return onLog(state, String(event.data.runId), event.data.message, event.time)
    case 'tool-workflow/run-end':
      return onRunEnd(state, String(event.data.runId), event.data.stopReason, event.time)
    case 'turn/end':
      return event.data.reason.kind === 'interrupted' || event.data.reason.kind === 'forked' ? interruptRuns(state, event.time) : state
    case 'agent-preset/selected':
      return withPreset(state, event.data.agentPreset)
    default:
      return state
  }
}

function withPreset(state: ResearchState, agentPreset: string): ResearchState {
  return state.agentPreset === agentPreset ? state : { ...state, agentPreset }
}

// ---------------------------------------------------------------- tool calls

const STATUS_COMMAND = /(?:^|[\s;&|(])(?:\S*\/)?(?:sagent|sa)\b[^;&|\n]*?\bresearch\s+status\b/u
const WORKSPACE_FLAG = /(?:-w|--workspace)(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/u

/** A `sagent research status` call: its workspace when named, else `undefined`. */
function statusCall(name: string, argumentsJson: string): { readonly workspace?: string | undefined } | undefined {
  const args = parseObject(argumentsJson)
  if (name === 'mcp__science-agent__sa_research') {
    return args?.['action'] === 'status' ? { workspace: str(args['workspace']) } : undefined
  }
  if (name !== 'bash' && name !== 'pwsh') return undefined
  const command = typeof args?.['command'] === 'string' ? args['command'] : ''
  const found = STATUS_COMMAND.exec(command)
  if (found === null) return undefined
  const flag = WORKSPACE_FLAG.exec(found[0])
  return { workspace: flag === null ? undefined : (flag[1] ?? flag[2] ?? flag[3]) }
}

function onToolCall(state: ResearchState, callId: string, name: string, argumentsJson: string): ResearchState {
  const skill = name === 'skill' ? parseObject(argumentsJson)?.['name'] : undefined
  if (!state.skillLoaded && typeof skill === 'string' && SCIENCE_SKILLS.includes(skill)) {
    return { ...state, skillLoaded: true }
  }
  const loop = workflowCall(name, argumentsJson, RESEARCH_WORKFLOW)
  if (loop !== undefined) return { ...state, calls: { ...state.calls, [callId]: compact({ purpose: 'loop' as const, workspace: loop.workspace }) } }
  const status = statusCall(name, argumentsJson)
  if (status !== undefined) return { ...state, calls: { ...state.calls, [callId]: compact({ purpose: 'status' as const, workspace: status.workspace }) } }
  return state
}

function onToolResult(state: ResearchState, callId: string, text: string, failed: boolean, time: number): ResearchState {
  const binding = state.calls[callId]
  // A paper-writing call settles in the paper fold.
  if (binding === undefined || binding.purpose === 'paper') return state
  const { [callId]: _settled, ...calls } = state.calls
  let next: ResearchState = { ...state, calls }
  const payloads = failed ? [] : payloadsOf(text)
  if (binding.purpose === 'status') {
    const ledger = payloads.map(payload => ledgerOf(payload, binding.workspace, time)).find(value => value !== undefined)
    return ledger === undefined ? next : { ...next, ledger }
  }
  const run = next.runs.find(candidate => candidate.callId === callId)
  if (run === undefined) return next
  const result = payloads.find(payload => Array.isArray(payload['rounds']))
  next = updateRun(next, run.runId, current => (result === undefined
    ? (failed && current.status === 'running' ? { ...current, status: 'failed', endedAt: time } : current)
    : applyLoopResult(current, result, time)))
  return next
}

// ---------------------------------------------------------------- workflow runs

function updateRun(state: ResearchState, runId: string, update: (run: ResearchRun) => ResearchRun): ResearchState {
  const index = state.runs.findIndex(run => run.runId === runId)
  if (index === -1) return state
  const current = state.runs[index]
  if (current === undefined) return state
  const updated = update(current)
  if (updated === current) return state
  const runs = state.runs.slice()
  runs[index] = updated
  return { ...state, runs }
}

function onRunStart(state: ResearchState, runId: string, time: number): ResearchState {
  if (state.runs.some(run => run.runId === runId)) return state
  // A run-start follows its workflow tool call; bind the oldest loop call that has no run yet.
  const bound = new Set(state.runs.map(run => run.callId))
  const entry = Object.entries(state.calls).find(([callId, call]) => call.purpose === 'loop' && !bound.has(callId))
  const run: ResearchRun = compact({
    runId,
    callId: entry?.[0],
    workspace: entry?.[1].workspace,
    status: 'running' as const,
    startedAt: time,
    rounds: [],
    notes: [],
  })
  return { ...state, runs: pushBounded(state.runs, run, MAX_RUNS) }
}

function emptyRound(number: number, time: number): ResearchRound {
  return { number, status: 'running', startedAt: time, experiments: [], members: [], notes: [] }
}

/** Apply `update` to round `number` of the run, creating it when it is new. */
function withRound(run: ResearchRun, number: number, time: number, update: (round: ResearchRound) => ResearchRound): ResearchRun {
  const index = run.rounds.findIndex(round => round.number === number)
  const current = index === -1 ? emptyRound(number, time) : run.rounds[index]
  if (current === undefined) return run
  const updated = update(current)
  if (index !== -1 && updated === current) return run
  const rounds = index === -1
    ? pushBounded(run.rounds, updated, MAX_ROUNDS)
    : run.rounds.map((round, at) => (at === index ? updated : round))
  return { ...run, rounds }
}

function withExperiment(round: ResearchRound, id: string, update: (experiment: ResearchExperiment) => ResearchExperiment): ResearchRound {
  const index = round.experiments.findIndex(experiment => experiment.id === id)
  if (index === -1 && round.experiments.length >= MAX_EXPERIMENTS) return round
  const current = index === -1 ? { id: clip(id, SHORT_TEXT) } : round.experiments[index]
  if (current === undefined) return round
  const updated = compact(update(current))
  const experiments = index === -1
    ? [...round.experiments, updated]
    : round.experiments.map((experiment, at) => (at === index ? updated : experiment))
  return { ...round, experiments }
}

function onAgentStart(state: ResearchState, runId: string, seq: number, label: string, childId: string, time: number): ResearchState {
  return updateRun(state, runId, (run) => {
    if (label === 'write-up') return { ...run, writeUp: { seq, status: 'running', childId, startedAt: time } }
    const parsed = parseLabel(label)
    if (parsed === undefined) return run
    const number = parsed.round ?? run.rounds[run.rounds.length - 1]?.number
    if (number === undefined) return run
    const member: ResearchMember = compact({
      seq,
      label: clip(label, SHORT_TEXT),
      kind: parsed.kind,
      status: 'running' as const,
      experimentId: parsed.experimentId,
      focusId: parsed.focusId,
      pass: parsed.pass,
      childId,
      startedAt: time,
    })
    return withRound(run, number, time, (round) => {
      const withMember = { ...round, status: 'running' as const, members: pushBounded(round.members, member, MAX_MEMBERS) }
      return parsed.experimentId === undefined ? withMember : withExperiment(withMember, parsed.experimentId, experiment => experiment)
    })
  })
}

function onAgentEnd(state: ResearchState, runId: string, seq: number, outcome: string, time: number): ResearchState {
  return updateRun(state, runId, (run) => {
    if (run.writeUp?.seq === seq) return { ...run, writeUp: { ...run.writeUp, status: settled(outcome), endedAt: time } }
    const index = run.rounds.findIndex(round => round.members.some(member => member.seq === seq))
    const round = run.rounds[index]
    if (round === undefined) return run
    const members = round.members.map(member => (member.seq === seq ? { ...member, status: settled(outcome), endedAt: time } : member))
    const closed = members.some(member => member.seq === seq && member.kind === 'close' && outcome === 'completed')
    const updated: ResearchRound = closed ? { ...round, members, status: 'completed', endedAt: time } : { ...round, members }
    return { ...run, rounds: run.rounds.map((candidate, at) => (at === index ? updated : candidate)) }
  })
}

function applyLine(run: ResearchRun, line: ParsedLine | undefined, raw: string, time: number): ResearchRun {
  if (line === undefined) return { ...run, notes: pushBounded(run.notes, clip(raw, TEXT), MAX_NOTES) }
  switch (line.kind) {
    case 'open':
      return withRound(run, line.round, time, round => ({
        ...round,
        roundId: clip(line.roundId, SHORT_TEXT),
        ...(line.reused ? { reused: true } : {}),
      }))
    case 'reading':
      return withRound(run, line.round, time, round => ({
        ...round,
        retrieval: { focuses: line.focuses, passes: line.passes, enough: line.enough },
      }))
    case 'plan':
      return withRound(run, line.round, time, round => line.experiments.slice(0, MAX_EXPERIMENTS).reduce<ResearchRound>(
        (current, planned) => withExperiment(current, planned.id, experiment => ({
          ...experiment,
          title: clip(planned.title, SHORT_TEXT),
          role: planned.role,
        })),
        { ...round, plan: { registered: true } },
      ))
    case 'plan-error':
      return withRound(run, line.round, time, round => ({ ...round, plan: { registered: false, error: clip(line.error, TEXT) } }))
    case 'verdict':
      return withRound(run, line.round, time, round => withExperiment(round, line.id, experiment => ({
        ...experiment,
        outcome: 'ran',
        verdict: line.verdict,
        confidence: clip(line.confidence, SHORT_TEXT),
        unresolved: line.unresolved.slice(0, MAX_LIST),
        runIds: line.runIds.slice(0, MAX_LIST),
      })))
    case 'outcome':
      return withRound(run, line.round, time, round => withExperiment(round, line.id, experiment => ({
        ...experiment,
        outcome: line.outcome,
        reason: clip(line.reason, TEXT),
        ...(line.runIds.length > 0 ? { runIds: line.runIds.slice(0, MAX_LIST) } : {}),
      })))
    case 'next':
      return withRound(run, line.round, time, round => ({ ...round, decision: line.decision, reason: clip(line.reason, TEXT) }))
    case 'human':
      return withRound(run, line.round, time, round => ({ ...round, needsHuman: clip(line.text, TEXT) }))
    case 'round-note':
      return withRound(run, line.round, time, round => ({ ...round, notes: pushBounded(round.notes, clip(line.text, TEXT), MAX_NOTES) }))
    case 'stopped':
      return {
        ...run,
        stop: compact({ reason: clip(line.reason, SHORT_TEXT), detail: line.detail === undefined ? undefined : clip(line.detail, TEXT) }),
      }
    case 'write-up':
      return { ...run, answer: clip(line.answer, LONG_TEXT) }
    default: {
      const unhandled: never = line
      return unhandled
    }
  }
}

function onLog(state: ResearchState, runId: string, message: string, time: number): ResearchState {
  return updateRun(state, runId, run => applyLine(run, parseLogLine(message), message, time))
}

function onRunEnd(state: ResearchState, runId: string, stopReason: string, time: number): ResearchState {
  return updateRun(state, runId, (run) => {
    const status = settled(stopReason)
    // Members still running when the run ends never report their own end; they settle with the run.
    const settle = (member: ResearchMember): ResearchMember => (member.status === 'running' ? { ...member, status, endedAt: time } : member)
    const rounds = run.rounds.map(round => (round.status === 'running'
      ? { ...round, status, endedAt: time, members: round.members.map(settle) }
      : round))
    const writeUp = run.writeUp?.status === 'running' ? { ...run.writeUp, status, endedAt: time } : run.writeUp
    return compact({ ...run, status, endedAt: time, rounds, writeUp })
  })
}

function interruptRuns(state: ResearchState, time: number): ResearchState {
  if (!state.runs.some(run => run.status === 'running')) return state
  return state.runs.filter(run => run.status === 'running').reduce((current, run) => onRunEnd(current, run.runId, 'cancelled', time), state)
}

// ---------------------------------------------------------------- final workflow result

function applyLoopResult(run: ResearchRun, result: Record<string, unknown>, time: number): ResearchRun {
  let next = run
  for (const value of Array.isArray(result['rounds']) ? result['rounds'] : []) {
    if (!isRecord(value)) continue
    const number = num(value['number'])
    if (number === undefined) continue
    next = withRound(next, number, time, (round) => {
      const retrieval = isRecord(value['retrieval']) ? value['retrieval'] : undefined
      const snapshot = str(value['registered_plan'])
      const error = str(value['registration_error'])
      const decision = value['decision'] === 'continue' || value['decision'] === 'stop' ? value['decision'] : undefined
      let updated: ResearchRound = compact({
        ...round,
        roundId: round.roundId ?? str(value['round_id'], SHORT_TEXT),
        retrieval: retrieval === undefined
          ? round.retrieval
          : { focuses: num(retrieval['focuses']) ?? 0, passes: num(retrieval['passes']) ?? 0, enough: retrieval['enough'] === true },
        plan: snapshot !== undefined ? { registered: true, snapshot } : error !== undefined ? { registered: false, error } : round.plan,
        decision: decision ?? round.decision,
        reason: str(value['reason']) ?? round.reason,
        needsHuman: str(value['needs_human']) ?? round.needsHuman,
        status: value['closed'] === true ? 'completed' as const : round.status,
      })
      for (const item of Array.isArray(value['experiments']) ? value['experiments'] : []) {
        if (!isRecord(item) || typeof item['id'] !== 'string') continue
        const verdict = verdictSchema.safeParse(item['verdict'])
        updated = withExperiment(updated, item['id'], experiment => ({
          ...experiment,
          outcome: str(item['status'], SHORT_TEXT) ?? experiment.outcome,
          verdict: verdict.success ? verdict.data : experiment.verdict,
          confidence: str(item['confidence'], SHORT_TEXT) ?? experiment.confidence,
          unresolved: Array.isArray(item['unresolved']) ? strings(item['unresolved']) : experiment.unresolved,
          runIds: Array.isArray(item['run_ids']) ? strings(item['run_ids']) : experiment.runIds,
          reason: str(item['reason']) ?? experiment.reason,
        }))
      }
      for (const id of strings(value['not_run_by_cap'], MAX_EXPERIMENTS)) {
        updated = withExperiment(updated, id, experiment => ({ ...experiment, notRunByCap: true }))
      }
      return updated
    })
  }
  const stop = isRecord(result['stop']) ? result['stop'] : undefined
  const report = isRecord(result['report']) ? result['report'] : undefined
  return compact({
    ...next,
    stop: stop === undefined ? next.stop : compact({ reason: str(stop['reason'], SHORT_TEXT) ?? 'unknown', detail: str(stop['detail']) }),
    answer: str(report?.['answer'], LONG_TEXT) ?? next.answer,
  })
}

// ---------------------------------------------------------------- research status

function ledgerExperiment(value: Record<string, unknown>): LedgerExperiment | undefined {
  const id = str(value['id'], SHORT_TEXT)
  if (id === undefined) return undefined
  const evidence = value['evidence_class']
  const evidenceClass = evidence === 'confirmatory' ? 'confirmatory' : evidence === 'exploratory' ? 'exploratory' : undefined
  return compact<LedgerExperiment>({
    id,
    title: str(value['title'], SHORT_TEXT),
    role: str(value['role'], SHORT_TEXT),
    build: str(value['build'], SHORT_TEXT),
    runs: strings(value['runs']),
    verdict: str(value['verdict'], SHORT_TEXT),
    confidence: str(value['confidence'], SHORT_TEXT),
    verdictBy: str(value['verdict_by'], SHORT_TEXT),
    evidenceClass,
    demotedBy: strings(value['demoted_by'], 6).map(reason => clip(reason, TEXT)),
    flags: strings(value['flags'], 6),
    objections: (Array.isArray(value['objections']) ? value['objections'] : [])
      .filter(isRecord)
      .slice(0, MAX_LIST)
      .map(item => compact({ id: str(item['id'], SHORT_TEXT) ?? '?', status: str(item['status'], SHORT_TEXT) ?? 'open', summary: str(item['summary']) })),
  })
}

function ledgerRound(value: Record<string, unknown>): LedgerRound | undefined {
  const roundId = str(value['round_id'], SHORT_TEXT)
  if (roundId === undefined) return undefined
  const plan = isRecord(value['registered_plan']) ? value['registered_plan'] : undefined
  const planPath = str(plan?.['path'])
  return compact({
    roundId,
    number: num(value['number']),
    decision: str(value['decision'], SHORT_TEXT),
    reason: str(value['reason']),
    registeredPlan: plan === undefined || planPath === undefined
      ? undefined
      : compact({ path: planPath, registeredAt: str(plan['registered_at'], SHORT_TEXT), changedSince: plan['changed_since'] === true }),
    experiments: (Array.isArray(value['experiments']) ? value['experiments'] : [])
      .filter(isRecord)
      .slice(0, MAX_EXPERIMENTS)
      .map(ledgerExperiment)
      .filter((item): item is LedgerExperiment => item !== undefined),
  })
}

function ledgerOf(payload: Record<string, unknown>, workspace: string | undefined, time: number): ResearchLedger | undefined {
  if (!Array.isArray(payload['rounds']) || !('notebook' in payload || 'question' in payload)) return undefined
  return compact({
    time,
    workspace,
    question: str(payload['question'], LONG_TEXT),
    sources: num(payload['sources']),
    citations: num(payload['citations']),
    searches: num(payload['searches']),
    rounds: payload['rounds']
      .filter(isRecord)
      .slice(-MAX_LEDGER_ROUNDS)
      .map(ledgerRound)
      .filter((round): round is LedgerRound => round !== undefined),
  })
}
