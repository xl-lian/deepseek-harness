/**
 * Pure synchronous fold over one session log: science-agent workflow events,
 * direct subagent calls, and orchestrator `sagent` CLI/MCP steps become loop
 * rounds with seven stages. The projection registry drives this unit over every
 * committed event; unrelated events return the same state reference.
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { callAnchorId, classifyToolCall, parseJsonObject, runAnchorId, type ToolCallClassification } from '../shared/classify.ts'
import {
  STAGES,
  type CallPurpose,
  type LoopCandidate,
  type LoopCheck,
  type LoopCv,
  type LoopDecision,
  type LoopDesign,
  type LoopEvidence,
  type LoopHypothesis,
  type LoopL3,
  type LoopMember,
  type LoopReport,
  type LoopReportIssue,
  type LoopRound,
  type LoopScout,
  type LoopStage,
  type LoopState,
  type LoopStatus,
  type LoopVerdict,
  type LoopVerifiedRun,
  type StageId,
} from '../shared/types.ts'
import { deriveStage, isSettled } from '../shared/stage.ts'

const MAX_OUTPUT_CHARS = 4096
const MAX_SUMMARY_CHARS = 512
const MAX_PLAN_CHARS = 800
const MAX_NOTES_CHARS = 400
const MAX_STATUS_CHARS = 200
const MAX_FILE_CHARS = 200
const MAX_FILES = 20
const MAX_CHECKS = 32
const MAX_CHECK_CHARS = 240
const MAX_FLAGS = 8
const MAX_EVIDENCE = 8
const MAX_HYPOTHESES = 12
const MAX_CANDIDATES = 12
const MAX_ISSUES = 20
const MAX_VERIFIED_RUNS = 20
const MAX_METRICS = 12
const MAX_BUDGET_KEYS = 12
const MAX_MEMBERS_PER_STAGE = 50
const MAX_SUPPRESSED_ANCHORS = 20

/** Empty fold state for a session with no science-agent activity. */
export function initLoopState(agentPreset: string | null = null): LoopState {
  return { v: 1, rounds: [], calls: {}, runs: {}, agentPreset, scienceSkillLoaded: false }
}

/** Fold one committed session event into the loop state. */
export function reduceLoopEvent(state: LoopState, event: SessionEvent): LoopState {
  switch (event.type) {
    case 'tool/call':
      return onToolCall(state, event.data.callId, event.data.name, event.data.arguments, event.time)
    case 'tool/result':
      return onToolResult(state, event.data.message, event.data.error, event.time)
    case 'tool-workflow/run-start':
      return onRunStart(state, event.data.runId, event.time)
    case 'tool-workflow/agent-start':
      return onAgentStart(state, event.data, event.time)
    case 'tool-workflow/agent-end':
      return onAgentEnd(state, event.data, event.time)
    case 'tool-workflow/run-end':
      return onRunEnd(state, event.data.runId, event.data.stopReason, event.time)
    case 'turn/end':
      return onTurnEnd(state, event.data.reason, event.time)
    case 'agent-preset/selected':
      return state.agentPreset === event.data.agentPreset
        ? state
        : { ...state, agentPreset: event.data.agentPreset }
    default:
      return state
  }
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

function clipList(value: readonly string[], limit: number, itemLimit: number): string[] {
  return value.slice(0, limit).map(item => clip(item, itemLimit))
}

function compact<T extends object>(value: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out as T
}

function emptyStage(id: StageId): LoopStage {
  return { id, status: 'pending', members: [] }
}

function emptyStages(): Record<StageId, LoopStage> {
  return Object.fromEntries(STAGES.map(id => [id, emptyStage(id)])) as Record<StageId, LoopStage>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function errorText(value: unknown): string | undefined {
  const direct = str(value)
  if (direct !== undefined) return direct
  return isRecord(value) ? str(value['message']) : undefined
}

function parseTime(value: unknown): number | undefined {
  const number = num(value)
  if (number !== undefined) return number
  const text = str(value)
  if (text === undefined) return undefined
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Best-effort metric extraction from RunManifest or an arbitrary reported-metrics object. */
function metricRecord(value: unknown, depth = 0): Record<string, number> | undefined {
  if (!isRecord(value) || depth > 3) return undefined
  if (isRecord(value['reported'])) return metricRecord(value['reported'], depth + 1)
  const name = str(value['metric_name'])
  const metric = num(value['value'])
  if (name !== undefined && metric !== undefined) return { [name]: metric }
  const entries: [string, number][] = []
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'reported' || key === 'fold_scores' || key === 'seeds' || key === 'seed' || key === 'n' || key === 'n_folds') continue
    const number = num(entry)
    if (number !== undefined) {
      entries.push([key, number])
      continue
    }
    if (isRecord(entry) && depth < 2) {
      const nested = metricRecord(entry, depth + 1)
      if (nested !== undefined) {
        for (const [nestedKey, nestedValue] of Object.entries(nested)) entries.push([`${key}.${nestedKey}`, nestedValue])
      }
    }
  }
  return entries.length === 0 ? undefined : Object.fromEntries(entries.slice(0, MAX_METRICS))
}

function metricsSummary(metrics: Readonly<Record<string, number>>): string {
  return Object.entries(metrics)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${Number.isInteger(value) ? value : value.toFixed(4)}`)
    .join(' · ')
}

function verdictSummary(verdict: LoopVerdict, trust: string | undefined, checkCount: number): string {
  return `${verdict}${trust === undefined ? '' : ` · trust ${trust}`}${checkCount > 0 ? ` · ${checkCount} checks` : ''}`
}

function designSummary(design: LoopDesign): string | undefined {
  const parts: string[] = []
  if (design.best !== undefined) {
    parts.push(`best ${design.best.runId}${design.best.value === undefined ? '' : ` = ${design.best.value}`}`)
  }
  if (design.delta !== undefined) parts.push(`Δ ${design.delta}`)
  if (design.multipleComparisons !== undefined) parts.push(`${design.multipleComparisons} comparisons`)
  return parts.length === 0 ? undefined : clip(parts.join(' · '), MAX_SUMMARY_CHARS)
}

function findRound(state: LoopState, roundId: string | undefined): LoopRound | undefined {
  return roundId === undefined ? undefined : state.rounds.find(round => round.id === roundId)
}

function withRound(state: LoopState, round: LoopRound): LoopState {
  const exists = state.rounds.some(candidate => candidate.id === round.id)
  const rounds = exists
    ? state.rounds.map(candidate => (candidate.id === round.id ? round : candidate))
    : [...state.rounds, round]
  return { ...state, rounds, activeRoundId: round.id }
}

function bindCall(
  state: LoopState,
  callId: string,
  roundId: string,
  purposes: readonly CallPurpose[],
  stageName?: string,
  roundOutcome?: string,
): LoopState {
  const previous = state.calls[callId]
  const merged = previous === undefined ? purposes : [...new Set([...previous.purposes, ...purposes])]
  const name = stageName ?? previous?.stageName
  const outcome = roundOutcome ?? previous?.roundOutcome
  return {
    ...state,
    calls: {
      ...state.calls,
      [callId]: compact({ roundId, purposes: merged, stageName: name, roundOutcome: outcome }),
    },
  }
}

function ensureRound(
  state: LoopState,
  options: { roundId?: string | undefined; mode?: string | undefined; callId: string; time: number; anchorKind: 'workflow' | 'direct' },
): { state: LoopState; round: LoopRound } {
  const byRoundId = options.roundId === undefined
    ? undefined
    : state.rounds.find(round => round.roundId === options.roundId)
  const active = state.rounds.find(round => round.id === state.activeRoundId)
  const existing = byRoundId ?? active
  if (existing !== undefined) {
    const updated: LoopRound = {
      ...existing,
      roundId: existing.roundId ?? options.roundId,
      mode: existing.mode ?? options.mode,
      status: existing.status === 'pending' ? 'running' : existing.status,
      startedAt: existing.startedAt ?? options.time,
    }
    return { state: updated === existing ? state : withRound(state, updated), round: updated }
  }
  const created: LoopRound = {
    id: `round-${options.callId}`,
    roundId: options.roundId,
    mode: options.mode,
    status: 'running',
    startedAt: options.time,
    anchor: { kind: options.anchorKind, id: callAnchorId(options.callId) },
    suppressedAnchors: [],
    stages: emptyStages(),
  }
  return { state: withRound(state, created), round: created }
}

function onToolCall(state: LoopState, callId: string, name: string, argumentsJson: string, time: number): LoopState {
  const withSkill = isScienceSkillCall(name, argumentsJson)
    ? { ...state, scienceSkillLoaded: true as const }
    : state
  const classifications = classifyToolCall(name, argumentsJson)
  if (classifications.length === 0) return withSkill
  let next = withSkill
  for (const classification of classifications) {
    next = applyClassification(next, callId, name, classification, time)
  }
  return next
}

function isScienceSkillCall(name: string, argumentsJson: string): boolean {
  if (name !== 'skill') return false
  const skill = str(parseJsonObject(argumentsJson)?.['name'])
  return skill === 'science-agent' || skill === 'science-agent-kaggle'
}

function applyClassification(
  state: LoopState,
  callId: string,
  toolName: string,
  classification: ToolCallClassification,
  time: number,
): LoopState {
  if (classification.purpose === 'workflow') {
    const ensured = ensureRound(state, {
      roundId: classification.roundId,
      mode: classification.mode,
      callId,
      time,
      anchorKind: 'workflow',
    })
    const round: LoopRound = {
      ...ensured.round,
      workflow: { ...ensured.round.workflow, callId, startedAt: time },
    }
    return bindCall(withRound(ensured.state, recomputeStages(round)), callId, round.id, ['workflow'])
  }

  if (classification.purpose === 'round-stage') {
    const ensured = ensureRound(state, { roundId: classification.roundId, callId, time, anchorKind: 'direct' })
    const stageId = sagentStageId(classification.stageName)
    if (stageId !== undefined) {
      const status = sagentStageStatus(classification.stageStatus)
      const stage = ensured.round.stages[stageId]
      const updated = recomputeStages({
        ...ensured.round,
        stages: { ...ensured.round.stages, [stageId]: { ...stage, explicit: { status, seq: time } } },
      })
      return bindCall(withRound(ensured.state, updated), callId, updated.id, ['round-stage'], classification.stageName)
    }
    return bindCall(ensured.state, callId, ensured.round.id, ['round-stage'], classification.stageName)
  }

  if (classification.purpose === 'round-end') {
    const ensured = ensureRound(state, { roundId: classification.roundId, callId, time, anchorKind: 'direct' })
    return bindCall(ensured.state, callId, ensured.round.id, ['round-end'], undefined, classification.roundOutcome)
  }

  if (classification.purpose === 'round-begin') {
    // Every round begin starts a new round. Reusing the active round here would
    // merge consecutive rounds into one card (the round id only arrives with the
    // CLI result, after the call itself).
    const round: LoopRound = {
      id: `round-${callId}`,
      roundId: classification.roundId,
      mode: classification.mode,
      status: 'running',
      startedAt: time,
      anchor: { kind: 'direct', id: callAnchorId(callId) },
      suppressedAnchors: [],
      stages: emptyStages(),
    }
    return bindCall(withRound(state, round), callId, round.id, ['round-begin'])
  }

  if (classification.purpose === 'ignore') return state

  const stageId = classification.stage
  if (stageId === undefined) return state
  const ensured = ensureRound(state, { roundId: classification.roundId, callId, time, anchorKind: 'direct' })
  const member: LoopMember = {
    id: `call:${callId}:${stageId}:${ensured.round.stages[stageId].members.length}`,
    label: classification.label ?? toolName,
    role: classification.role ?? 'orchestrator',
    agent: classification.agent ?? toolName,
    kind: toolName === 'bash' || toolName === 'pwsh' || toolName.startsWith('mcp__') ? 'command' : 'tool',
    status: 'running',
    startedAt: time,
    callId,
  }
  const round = addMember(ensured.round, stageId, member)
  return bindCall(withRound(ensured.state, round), callId, round.id, [classification.purpose])
}

function sagentStageId(name: string | undefined): StageId | undefined {
  switch (name) {
    case 'scout': return 'scout'
    case 'hypotheses': return 'hypotheses'
    case 'execute':
    case 'engineer': return 'engineer'
    case 'verify':
    case 'verifier': return 'verifier'
    case 'statistician': return 'statistician'
    case 'decide': return 'decide'
    case 'report': return 'report'
    default: return undefined
  }
}

function sagentStageStatus(status: string | undefined): LoopStatus {
  switch (status) {
    case 'running': return 'running'
    case 'failed': return 'failed'
    case 'pending': return 'pending'
    case 'completed':
    case 'skipped':
    default: return 'completed'
  }
}

function addMember(round: LoopRound, stageId: StageId, member: LoopMember): LoopRound {
  const stage = round.stages[stageId]
  const members = [...stage.members, member].slice(-MAX_MEMBERS_PER_STAGE)
  const stages = { ...round.stages, [stageId]: { ...stage, members } }
  return recomputeStages({
    ...round,
    stages,
    startedAt: round.startedAt ?? member.startedAt,
    status: round.status === 'pending' ? 'running' : round.status,
  })
}

function deriveRoundStatus(round: LoopRound): LoopStatus {
  const stages = STAGES.map(id => round.stages[id])
  const anyRunning = stages.some(stage => stage.status === 'running')
  if (round.status === 'blocked') return 'blocked'
  if (anyRunning) return 'running'
  // `sagent round end` is authoritative. The workflow engine reports
  // stopReason "error" when any child agent fails, including an optional
  // hypothesis lens the script tolerated; a recorded round outcome outranks it.
  if (round.status === 'completed' || round.status === 'failed') return round.status
  if (round.workflow?.stopReason === 'cancelled') return 'cancelled'
  if (round.workflow?.stopReason === 'error') return 'failed'
  if (round.endedAt !== undefined) {
    return stages.some(stage => stage.status === 'failed') ? 'failed' : 'completed'
  }
  if (stages.every(stage => stage.status === 'pending')) {
    return round.status === 'pending' ? 'pending' : round.status
  }
  if (stages.some(stage => stage.status === 'failed')) return 'failed'
  if (stages.some(stage => stage.status === 'cancelled')) return 'cancelled'
  if (stages.some(stage => stage.status === 'interrupted')) return 'interrupted'
  if (stages.every(stage => stage.status === 'completed')) return 'completed'
  return 'running'
}

function recomputeStages(round: LoopRound): LoopRound {
  const stages = Object.fromEntries(
    STAGES.map(id => [id, deriveStage(round.stages[id])]),
  ) as Record<StageId, LoopStage>
  return { ...round, stages, status: deriveRoundStatus({ ...round, stages }) }
}

function onRunStart(state: LoopState, runId: string, time: number): LoopState {
  const boundRoundId = state.runs[runId]
  if (boundRoundId !== undefined) return state

  const pending = [...state.rounds]
    .reverse()
    .find(round => round.workflow?.callId !== undefined && round.workflow.runId === undefined)

  let round: LoopRound
  let next: LoopState
  if (pending !== undefined) {
    const anchorId = callAnchorId(pending.workflow?.callId ?? '')
    const suppressed = pending.anchor.kind === 'workflow'
      ? [...new Set([...pending.suppressedAnchors, anchorId])].slice(-MAX_SUPPRESSED_ANCHORS)
      : [...new Set([...pending.suppressedAnchors, runAnchorId(runId)])].slice(-MAX_SUPPRESSED_ANCHORS)
    round = {
      ...pending,
      anchor: pending.anchor.kind === 'workflow' ? { kind: 'workflow', id: runAnchorId(runId) } : pending.anchor,
      suppressedAnchors: suppressed,
      workflow: { ...pending.workflow, runId, startedAt: pending.workflow?.startedAt ?? time },
      status: 'running',
    }
    next = withRound(state, round)
  } else {
    round = {
      id: `round-run-${runId}`,
      status: 'running',
      startedAt: time,
      anchor: { kind: 'workflow', id: runAnchorId(runId) },
      suppressedAnchors: [],
      stages: emptyStages(),
      workflow: { runId, startedAt: time },
    }
    next = withRound(state, round)
  }
  const runs = { ...next.runs, [runId]: round.id }
  return { ...next, runs }
}

interface WorkflowAgentStartData {
  readonly runId: string
  readonly seq: number
  readonly label: string
  readonly phase?: string
  readonly childId: string
}

function workflowStage(label: string, phase: string | undefined): { stage: StageId; role: string } {
  if (label === 'scout') return { stage: 'scout', role: 'sa-scout' }
  if (label.startsWith('hypothesis-')) return { stage: 'hypotheses', role: 'sa-hypothesis' }
  if (label === 'register') return { stage: 'hypotheses', role: 'sa-clerk' }
  if (label === 'promote') return { stage: 'engineer', role: 'sa-clerk' }
  if (label === 'domain' || label === 'doctor' || label === 'campaign-begin' || /^check-\d+$/.test(label) || label.startsWith('round-begin-')) {
    return { stage: 'scout', role: 'sa-clerk' }
  }
  if (label.startsWith('round-close-')) return { stage: 'decide', role: 'sa-clerk' }
  if (label === 'campaign-end') return { stage: 'report', role: 'sa-clerk' }
  if (label === 'summary') return { stage: 'report', role: 'sa-reporter' }
  if (label.startsWith('engineer-') || label.startsWith('repair-') || label.startsWith('confirm-')) return { stage: 'engineer', role: 'sa-engineer' }
  if (label.startsWith('verify-') || label.startsWith('reverify-')) return { stage: 'verifier', role: 'sa-verifier' }
  if (label === 'l3-design') return { stage: 'statistician', role: 'sa-statistician' }
  if (phase === 'Scout') return { stage: 'scout', role: 'sa-scout' }
  if (phase === 'Hypotheses' || phase === 'Select') return { stage: 'hypotheses', role: 'sa-hypothesis' }
  if (phase === 'Preflight' || phase === 'Plan') return { stage: 'scout', role: 'sa-clerk' }
  if (phase === 'Close') return { stage: 'decide', role: 'sa-clerk' }
  if (phase === 'Wrap-up') return { stage: 'report', role: 'sa-reporter' }
  if (phase === 'Implement & Execute') return { stage: 'engineer', role: 'sa-engineer' }
  if (phase === 'Verify') return { stage: 'verifier', role: 'sa-verifier' }
  return { stage: 'scout', role: 'sa-scout' }
}

function onAgentStart(state: LoopState, data: WorkflowAgentStartData, time: number): LoopState {
  const roundId = state.runs[data.runId]
  const round = findRound(state, roundId)
  if (round === undefined) return state
  const { stage, role } = workflowStage(data.label, data.phase)
  const member: LoopMember = {
    id: `wf:${data.runId}:${data.seq}`,
    label: data.label,
    role,
    agent: role,
    kind: 'workflow',
    status: 'running',
    startedAt: time,
    childId: data.childId,
  }
  return withRound(state, addMember(round, stage, member))
}

function onAgentEnd(
  state: LoopState,
  data: { readonly runId: string; readonly seq: number; readonly outcome: 'completed' | 'failed' | 'cancelled' },
  time: number,
): LoopState {
  const roundId = state.runs[data.runId]
  const round = findRound(state, roundId)
  if (round === undefined) return state
  let changed = false
  const stages = Object.fromEntries(
    STAGES.map((id) => {
      const stage = round.stages[id]
      if (!stage.members.some(member => member.id === `wf:${data.runId}:${data.seq}`)) return [id, stage]
      changed = true
      const members = stage.members.map((member) => {
        if (member.id !== `wf:${data.runId}:${data.seq}`) return member
        const status: LoopStatus = data.outcome === 'completed'
          ? 'completed'
          : data.outcome === 'cancelled' ? 'cancelled' : 'failed'
        return { ...member, status, endedAt: time, outcome: data.outcome }
      })
      return [id, { ...stage, members }]
    }),
  ) as Record<StageId, LoopStage>
  if (!changed) return state
  return withRound(state, recomputeStages({ ...round, stages }))
}

function onRunEnd(state: LoopState, runId: string, stopReason: string, time: number): LoopState {
  const roundId = state.runs[runId]
  const round = findRound(state, roundId)
  if (round === undefined) return state
  const terminal: LoopStatus = stopReason === 'completed'
    ? 'completed'
    : stopReason === 'cancelled' ? 'cancelled' : 'failed'
  let changed = false
  const stages = Object.fromEntries(
    STAGES.map((id) => {
      const stage = round.stages[id]
      if (!stage.members.some(member => member.childId !== undefined && member.status === 'running')) return [id, stage]
      changed = true
      const members = stage.members.map((member) => {
        if (member.childId === undefined || member.status !== 'running') return member
        return { ...member, status: terminal, endedAt: time, outcome: stopReason }
      })
      return [id, { ...stage, members }]
    }),
  ) as Record<StageId, LoopStage>
  const workflow = {
    ...round.workflow,
    stopReason,
    ...(terminal === 'failed' ? { error: round.workflow?.error ?? stopReason } : {}),
  }
  const nextRound: LoopRound = {
    ...round,
    ...(changed ? { stages } : {}),
    workflow,
    ...(terminal === 'failed' || terminal === 'cancelled' ? { endedAt: time } : {}),
  }
  return withRound(state, recomputeStages(nextRound))
}

function onTurnEnd(state: LoopState, reason: { readonly kind: string }, time: number): LoopState {
  const interrupted = reason.kind === 'interrupted' || reason.kind === 'forked'
  let changed = false
  const rounds = state.rounds.map((round) => {
    if (interrupted) {
      if (round.workflow === undefined || round.workflow.stopReason !== undefined) return round
      let roundChanged = false
      const stages = Object.fromEntries(
        STAGES.map((id) => {
          const stage = round.stages[id]
          if (!stage.members.some(member => member.kind === 'workflow' && member.status === 'running')) return [id, stage]
          roundChanged = true
          const members = stage.members.map(member => (
            member.kind === 'workflow' && member.status === 'running'
              ? { ...member, status: 'interrupted' as const, endedAt: time, outcome: 'interrupted' }
              : member
          ))
          return [id, { ...stage, members }]
        }),
      ) as Record<StageId, LoopStage>
      if (!roundChanged) return round
      changed = true
      return recomputeStages({ ...round, stages })
    }
    // A normal turn end closes a settled round: Decide/Report that never arrived stay
    // pending, but the loop is no longer executing and the live surfaces must stop.
    if (round.endedAt !== undefined) return round
    if (STAGES.some(id => round.stages[id].members.some(member => member.status === 'running'))) return round
    if (round.workflow !== undefined && round.workflow.stopReason === undefined) return round
    if (!STAGES.some(id => round.stages[id].members.length > 0 || round.stages[id].status !== 'pending')) return round
    changed = true
    return recomputeStages({ ...round, endedAt: time })
  })
  return changed ? { ...state, rounds } : state
}

function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/** Split chained shell output into top-level JSON objects, quote- and brace-aware. */
function jsonObjectChunks(text: string): string[] {
  const chunks: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (char === '}') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start !== -1) {
        chunks.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return chunks
}

function unwrapEnvelope(record: Record<string, unknown>): Record<string, unknown>[] {
  if (record['ok'] === true) return isRecord(record['data']) ? [record['data']] : []
  if (record['ok'] === false) return []
  return [record]
}

/** Extract every JSON payload from a tool result: workflow return, one CLI document, or chained documents. */
function extractPayloads(text: string): Record<string, unknown>[] {
  const marker = text.indexOf('Return value:')
  if (marker !== -1) {
    const rest = text.slice(marker + 'Return value:'.length)
    const direct = parseJsonObject(rest.trim())
    if (direct !== undefined) return [direct]
    // Background job output appends a status line after the JSON.
    for (const chunk of jsonObjectChunks(rest)) {
      const parsed = parseJsonObject(chunk)
      if (parsed !== undefined) return [parsed]
    }
    return []
  }
  const whole = parseJsonObject(text)
  if (whole !== undefined) return unwrapEnvelope(whole)
  const payloads: Record<string, unknown>[] = []
  for (const chunk of jsonObjectChunks(text)) {
    const parsed = parseJsonObject(chunk)
    if (parsed !== undefined) payloads.push(...unwrapEnvelope(parsed))
  }
  return payloads
}

function onToolResult(
  state: LoopState,
  message: { readonly toolCallId: string; readonly content: readonly ContentBlock[]; readonly isError?: boolean },
  error: { readonly reason?: string } | undefined,
  time: number,
): LoopState {
  const callId = message.toolCallId
  const binding = state.calls[callId]
  const text = textOf(message.content)
  const failed = message.isError === true || error !== undefined
  let next = settleCallMembers(state, callId, failed, text, time)

  const payloads = extractPayloads(text)
  if (binding === undefined) {
    // A background workflow's structured return arrives through the job output
    // tool, not the original workflow call. Match it by the returned round id.
    const workflowPayload = payloads.find(
      payload => typeof payload['started'] === 'boolean' && typeof payload['roundId'] === 'string',
    )
    if (workflowPayload === undefined) return next
    const roundId = str(workflowPayload['roundId'])
    const target = roundId === undefined
      ? undefined
      : state.rounds.find(round => round.roundId === roundId)
    const round = target ?? [...state.rounds].reverse().find(candidate => candidate.workflow !== undefined)
    return round === undefined ? next : applyWorkflowResult(state, round.id, workflowPayload, failed, time)
  }

  if (payloads.length > 0) {
    const purposes = binding.purposes
    for (const purpose of purposes) {
      const aligned = payloads.length === purposes.length ? [payloads[purposes.indexOf(purpose)]] : payloads
      for (const payload of aligned) {
        if (payload === undefined) continue
        next = applyPayload(next, binding.roundId, callId, purpose, payload, failed, time, binding.stageName)
      }
    }
  } else if (binding.purposes.includes('workflow') && failed) {
    next = updateRound(next, binding.roundId, round => ({
      ...round,
      status: 'failed',
      workflow: { ...round.workflow, error: clip(error?.reason ?? text, MAX_SUMMARY_CHARS) },
      endedAt: time,
    }))
  }

  // Agents commonly pipe `sagent ... --json` through a formatter, so a
  // round-end result is not always parseable JSON. The command line already
  // carries the outcome; apply it so a finished round is not left "failed".
  if (binding.purposes.includes('round-end') && (failed || binding.roundOutcome !== undefined)) {
    const outcome = binding.roundOutcome
    const status: LoopStatus = failed
      ? 'failed'
      : outcome === 'failed' ? 'failed' : outcome === 'blocked' ? 'blocked' : 'completed'
    next = updateRound(next, binding.roundId, round => ({ ...round, status, endedAt: time }))
  }

  if (binding.purposes.includes('round-begin')) {
    const succeeded = payloads.some(payload => typeof payload['round_id'] === 'string')
    if (!succeeded) next = dropPlaceholderRound(next, binding.roundId)
  }

  const { [callId]: _removed, ...calls } = next.calls
  return { ...next, calls }
}

function settleCallMembers(state: LoopState, callId: string, failed: boolean, text: string, time: number): LoopState {
  const status: LoopStatus = failed ? 'failed' : 'completed'
  let changed = false
  const rounds = state.rounds.map((round) => {
    const hasOpen = STAGES.some(id => round.stages[id].members.some(
      member => member.callId === callId && !isSettled(member.status),
    ))
    if (!hasOpen) return round
    changed = true
    const stages = Object.fromEntries(
      STAGES.map((id) => {
        const stage = round.stages[id]
        if (!stage.members.some(member => member.callId === callId && !isSettled(member.status))) return [id, stage]
        const members = stage.members.map(member => (
          member.callId === callId && !isSettled(member.status)
            ? {
              ...member,
              status,
              endedAt: time,
              outcome: failed ? 'error' : 'completed',
              output: text.length === 0 ? member.output : clip(text, MAX_OUTPUT_CHARS),
            }
            : member
        ))
        return [id, { ...stage, members }]
      }),
    ) as Record<StageId, LoopStage>
    return recomputeStages({ ...round, stages })
  })
  return changed ? { ...state, rounds } : state
}

function applyPayload(
  state: LoopState,
  roundId: string | undefined,
  callId: string,
  purpose: CallPurpose,
  payload: Record<string, unknown>,
  failed: boolean,
  time: number,
  stageName?: string,
): LoopState {
  switch (purpose) {
    case 'workflow':
      return applyWorkflowResult(state, roundId, payload, failed, time)
    case 'round-begin':
      return updateRound(state, roundId, round => ({
        ...round,
        roundId: str(payload['round_id']) ?? round.roundId,
        mode: str(payload['mode']) ?? round.mode,
      }))
    case 'round-stage': {
      const round = findRound(state, roundId)
      if (round === undefined) return state
      const stageId = sagentStageId(str(payload['name']) ?? stageName)
      if (stageId === undefined) return state
      const status = sagentStageStatus(str(payload['status']))
      const summary = str(payload['summary'])
      const startedAt = parseTime(payload['started_at'])
      const endedAt = parseTime(payload['ended_at'])
      return updateRound(state, roundId, (current) => {
        const stage = current.stages[stageId]
        return recomputeStages({
          ...current,
          stages: {
            ...current.stages,
            [stageId]: compact({
              ...stage,
              explicit: { status, seq: time },
              summary: summary === undefined ? stage.summary : clip(summary, MAX_SUMMARY_CHARS),
              startedAt: startedAt ?? stage.startedAt,
              endedAt: endedAt ?? stage.endedAt,
            }),
          },
        })
      })
    }
    case 'round-end': {
      const outcome = str(payload['outcome'])
      const status: LoopStatus = outcome === 'failed' ? 'failed' : outcome === 'blocked' ? 'blocked' : 'completed'
      return updateRound(state, roundId, round => ({
        ...round,
        endedAt: time,
        status,
      }))
    }
    case 'decide': {
      const decision = mapDecision(payload)
      if (decision === undefined) return state
      let next = updateRound(state, roundId, round => ({ ...round, decision }))
      const summary = clip(
        `Chosen ${decision.chosenRunId ?? '—'}${decision.rationaleCode === undefined ? '' : ` (${decision.rationaleCode})`}`,
        MAX_SUMMARY_CHARS,
      )
      next = updateCallMembers(next, roundId, callId, member => ({ ...member, summary }))
      return next
    }
    case 'report': {
      const round = findRound(state, roundId)
      if (round === undefined) return state
      const report = mapReport(payload, round.report)
      if (report === undefined) return state
      let next = updateRound(state, roundId, current => ({ ...current, report }))
      const summary = clip(
        `${report.path ?? 'report'}${report.ok === undefined ? '' : report.ok ? ' · ok' : ' · failed'}${report.issues.length > 0 ? ` · ${report.issues.length} issues` : ''}`,
        MAX_SUMMARY_CHARS,
      )
      next = updateCallMembers(next, roundId, callId, member => ({ ...member, summary }))
      return next
    }
    case 'verifier': {
      const mapping = mapVerdict(payload)
      if (mapping === undefined) return state
      let next = updateCallMembers(state, roundId, callId, member => applyVerifyToMember(member, payload))
      const summary = mapping.summary ?? verdictSummary(mapping.verdict ?? 'warn', mapping.trust, mapping.checks?.length ?? 0)
      next = updateRound(next, roundId, round => ({
        ...round,
        stages: {
          ...round.stages,
          verifier: { ...round.stages.verifier, summary: clip(summary, MAX_SUMMARY_CHARS) },
        },
      }))
      return next
    }
    case 'statistician': {
      const design = mapDesign(payload)
      if (design === undefined) {
        const summary = str(payload['summary']) ?? str(payload['notes'])
        if (summary === undefined) return state
        return updateRound(state, roundId, round => ({
          ...round,
          stages: {
            ...round.stages,
            statistician: { ...round.stages.statistician, summary: clip(summary, MAX_SUMMARY_CHARS) },
          },
        }))
      }
      const summary = designSummary(design)
      return updateRound(state, roundId, round => ({
        ...round,
        design,
        stages: summary === undefined
          ? round.stages
          : { ...round.stages, statistician: { ...round.stages.statistician, summary } },
      }))
    }
    case 'engineer': {
      const mapping = mapRunResult(payload)
      if (mapping === undefined) return state
      let next = updateCallMembers(state, roundId, callId, member => ({
        ...member,
        ...compact(mapping),
        summary: mapping.summary ?? member.summary,
      }))
      const summary = mapping.summary
      if (summary !== undefined) {
        next = updateRound(next, roundId, round => ({
          ...round,
          stages: { ...round.stages, engineer: { ...round.stages.engineer, summary } },
        }))
      }
      return next
    }
    case 'scout': {
      const summary = str(payload['summary'])
      if (summary === undefined) return state
      return updateRound(state, roundId, round => ({
        ...round,
        stages: {
          ...round.stages,
          scout: { ...round.stages.scout, summary: clip(summary, MAX_SUMMARY_CHARS) },
        },
      }))
    }
    case 'hypothesis':
    case 'ignore':
      return state
    default:
      return state
  }
}

/** Remove the empty round a failed `sagent round begin` left behind. */
function dropPlaceholderRound(state: LoopState, roundId: string | undefined): LoopState {
  const round = findRound(state, roundId)
  if (round === undefined || round.roundId !== undefined || round.workflow !== undefined) return state
  const empty = STAGES.every((id) => {
    const stage = round.stages[id]
    return stage.members.length === 0 && stage.status === 'pending'
  })
  if (!empty) return state
  const rounds = state.rounds.filter(candidate => candidate.id !== round.id)
  if (state.activeRoundId !== round.id) return { ...state, rounds }
  const activeRoundId = rounds[rounds.length - 1]?.id
  return compact({ ...state, rounds, activeRoundId })
}

function updateRound(
  state: LoopState,
  roundId: string | undefined,
  update: (round: LoopRound) => LoopRound,
): LoopState {
  const round = findRound(state, roundId)
  if (round === undefined) return state
  const next = update(round)
  return next === round ? state : withRound(state, next)
}

function updateMemberByLabel(
  state: LoopState,
  roundId: string | undefined,
  label: string,
  update: (member: LoopMember) => LoopMember,
): LoopState {
  const round = findRound(state, roundId)
  if (round === undefined) return state
  let changed = false
  const stages = Object.fromEntries(
    STAGES.map((id) => {
      const stage = round.stages[id]
      if (!stage.members.some(member => member.label === label)) return [id, stage]
      const members = stage.members.map((member) => {
        if (member.label !== label) return member
        const next = update(member)
        if (next !== member) changed = true
        return next
      })
      return [id, { ...stage, members }]
    }),
  ) as Record<StageId, LoopStage>
  return changed ? withRound(state, recomputeStages({ ...round, stages })) : state
}

function updateCallMembers(
  state: LoopState,
  roundId: string | undefined,
  callId: string,
  update: (member: LoopMember) => LoopMember,
): LoopState {
  const round = findRound(state, roundId)
  if (round === undefined) return state
  let changed = false
  const stages = Object.fromEntries(
    STAGES.map((id) => {
      const stage = round.stages[id]
      if (!stage.members.some(member => member.callId === callId)) return [id, stage]
      const members = stage.members.map((member) => {
        if (member.callId !== callId) return member
        const next = update(member)
        if (next !== member) changed = true
        return next
      })
      return [id, { ...stage, members }]
    }),
  ) as Record<StageId, LoopStage>
  return changed ? withRound(state, recomputeStages({ ...round, stages })) : state
}

function parseVerdict(value: unknown): LoopVerdict | undefined {
  return value === 'pass' || value === 'warn' || value === 'fail' ? value : undefined
}

function mapScout(value: unknown): LoopScout | undefined {
  if (!isRecord(value)) return undefined
  const summary = str(value['summary'])
  if (summary === undefined) return undefined
  const cvRecord = isRecord(value['cv_recommendation']) ? value['cv_recommendation'] : undefined
  const cv: LoopCv | undefined = cvRecord === undefined ? undefined : compact({
    strategy: str(cvRecord['strategy']),
    groupColumn: str(cvRecord['group_column']),
    timeColumn: str(cvRecord['time_column']),
    reason: str(cvRecord['reason']),
  })
  return compact({
    summary: clip(summary, MAX_SUMMARY_CHARS),
    metric: str(value['metric']),
    taskType: str(value['task_type']),
    rowsTrain: num(value['rows_train']),
    columns: num(value['columns']),
    cv,
    baselinePresent: bool(value['baseline_present']),
    risks: strArray(value['risks']).slice(0, 8).map(risk => clip(risk, MAX_SUMMARY_CHARS)),
    evidence: mapEvidence(value['evidence_cards']),
  })
}

function mapEvidence(value: unknown): LoopEvidence[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).slice(0, MAX_EVIDENCE).map(item => compact({
    sourceType: str(item['source_type']),
    url: str(item['url']),
    quote: str(item['quote']) === undefined ? undefined : clip(str(item['quote']) ?? '', MAX_SUMMARY_CHARS),
    claim: str(item['claim']) === undefined ? undefined : clip(str(item['claim']) ?? '', MAX_SUMMARY_CHARS),
    support: str(item['support']),
  }))
}

function mapChecks(value: unknown): LoopCheck[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).slice(0, MAX_CHECKS).map((item) => {
    const status = str(item['status'])
    return compact({
      layer: str(item['layer']) ?? '',
      checkId: str(item['check_id']) ?? '',
      status: status === 'pass' || status === 'warn' || status === 'fail' || status === 'skip' ? status : 'skip',
      severity: str(item['severity']),
      summary: str(item['summary']) === undefined ? undefined : clip(str(item['summary']) ?? '', MAX_CHECK_CHARS),
    })
  })
}

function flagsFromChecks(checks: readonly LoopCheck[], status: LoopCheck['status'], severity?: string): string[] {
  return checks
    .filter(check => check.status === status && (severity === undefined || check.severity === severity))
    .map(check => clip(check.summary ?? check.checkId, MAX_CHECK_CHARS))
    .slice(0, MAX_FLAGS)
}

function mapVerdict(payload: Record<string, unknown>): (Partial<LoopMember> & { readonly verdict?: LoopVerdict }) | undefined {
  const verdict = parseVerdict(payload['verdict'])
  if (verdict === undefined) return undefined
  const trust = str(payload['trust'])
  const checks = mapChecks(payload['checks'])
  const metricsVerified = metricRecord(payload['metrics_verified'])
  const runIds = strArray(payload['run_ids'])
  const runId = str(payload['run_id'])
  if (runIds.length === 0 && runId !== undefined) runIds.push(runId)
  const blocking = strArray(payload['blocking_failures'])
  const warnings = strArray(payload['warnings'])
  const summary = str(payload['summary'])
  return compact({
    verdict,
    trust: trust === undefined ? undefined : clip(trust, MAX_STATUS_CHARS),
    checks: checks.length === 0 ? undefined : checks,
    metricsVerified,
    runIds: runIds.length === 0 ? undefined : runIds.slice(0, MAX_FILES),
    blockingFailures: blocking.length === 0 ? flagsFromChecks(checks, 'fail', 'blocking') : clipList(blocking, MAX_FLAGS, MAX_CHECK_CHARS),
    warnings: warnings.length === 0 ? flagsFromChecks(checks, 'warn') : clipList(warnings, MAX_FLAGS, MAX_CHECK_CHARS),
    repairable: bool(payload['repairable']),
    summary: summary === undefined ? undefined : clip(summary, MAX_SUMMARY_CHARS),
  })
}

function applyVerifyToMember(member: LoopMember, payload: Record<string, unknown>): LoopMember {
  const mapping = mapVerdict(payload)
  if (mapping === undefined) return member
  const checkCount = mapping.checks?.length ?? 0
  const summary = mapping.summary
    ?? (mapping.verdict === undefined ? undefined : verdictSummary(mapping.verdict, mapping.trust, checkCount))
  return compact({
    ...member,
    ...mapping,
    statusDetail: mapping.verdict === undefined
      ? member.statusDetail
      : verdictSummary(mapping.verdict, mapping.trust, checkCount),
    summary: summary === undefined ? member.summary : clip(summary, MAX_SUMMARY_CHARS),
  })
}

function mapRunResult(payload: Record<string, unknown>): Partial<LoopMember> | undefined {
  const runs = Array.isArray(payload['runs']) ? payload['runs'].filter(isRecord) : [payload]
  const runIds: string[] = []
  const metrics: Record<string, number> = {}
  const statuses: string[] = []
  const files: string[] = []
  let plan: string | undefined
  let notes: string | undefined
  let error: string | undefined
  let repaired: boolean | undefined
  for (const run of runs) {
    const runId = str(run['run_id'])
    if (runId !== undefined) runIds.push(runId)
    runIds.push(...strArray(run['run_ids']))
    const metric = metricRecord(run['metrics'])
    if (metric !== undefined) Object.assign(metrics, metric)
    const status = str(run['status'])
    if (status !== undefined) statuses.push(status)
    if (plan === undefined) plan = str(run['plan'])
    if (notes === undefined) notes = str(run['notes'])
    if (files.length === 0) files.push(...strArray(run['files']))
    if (repaired === undefined) repaired = bool(run['repaired'])
    if (error === undefined) error = errorText(run['error'])
  }
  if (runIds.length === 0 && Object.keys(metrics).length === 0 && statuses.length === 0 && error === undefined) return undefined
  const parts = [
    Object.keys(metrics).length === 0 ? undefined : metricsSummary(metrics),
    statuses.length === 0 ? undefined : statuses.join(', '),
    error === undefined ? undefined : clip(error, MAX_NOTES_CHARS),
  ].filter((part): part is string => part !== undefined)
  const summary = plan !== undefined
    ? clip(plan, MAX_SUMMARY_CHARS)
    : notes !== undefined ? clip(notes, MAX_SUMMARY_CHARS) : (parts.length === 0 ? undefined : clip(parts.join(' · '), MAX_SUMMARY_CHARS))
  return compact({
    runIds: runIds.length === 0 ? undefined : runIds.slice(0, MAX_FILES).map(id => clip(id, 120)),
    metrics: Object.keys(metrics).length === 0 ? undefined : metrics,
    statusDetail: statuses.length === 0 ? undefined : clip(statuses.join(', '), MAX_STATUS_CHARS),
    notes: notes === undefined ? (error === undefined ? undefined : clip(error, MAX_NOTES_CHARS)) : clip(notes, MAX_NOTES_CHARS),
    plan: plan === undefined ? undefined : clip(plan, MAX_PLAN_CHARS),
    files: files.length === 0 ? undefined : clipList(files, MAX_FILES, MAX_FILE_CHARS),
    repaired,
    summary,
  })
}

function applyRunToMember(member: LoopMember, payload: Record<string, unknown>): LoopMember {
  const mapping = mapRunResult(payload)
  if (mapping === undefined) return member
  const statusDetail = mapping.statusDetail
  const status: LoopStatus | undefined = statusDetail === undefined
    ? undefined
    : statusDetail.includes('failed') ? 'failed' : statusDetail.includes('blocked') ? 'blocked' : undefined
  return compact({
    ...member,
    ...mapping,
    ...(status === undefined ? {} : { status }),
  })
}

function mapHypotheses(value: unknown): LoopHypothesis[] | undefined {
  if (!Array.isArray(value)) return undefined
  const hypotheses = value.filter(isRecord).slice(0, MAX_HYPOTHESES).map(item => compact({
    hypothesisId: str(item['hypothesis_id']),
    experimentId: str(item['experiment_id']),
    statement: clip(str(item['statement']) ?? '', MAX_SUMMARY_CHARS),
    prediction: str(item['falsifiable_prediction']) === undefined
      ? undefined
      : clip(str(item['falsifiable_prediction']) ?? '', MAX_SUMMARY_CHARS),
    rationale: str(item['rationale']) === undefined ? undefined : clip(str(item['rationale']) ?? '', MAX_SUMMARY_CHARS),
    design: str(item['design']) === undefined ? undefined : clip(str(item['design']) ?? '', MAX_SUMMARY_CHARS),
    seeds: Array.isArray(item['seeds'])
      ? item['seeds'].filter((seed): seed is number => num(seed) !== undefined).slice(0, 8)
      : undefined,
    expectedDelta: num(item['expected_delta']),
    cost: str(item['cost']),
    leakageRisk: str(item['leakage_risk']),
    cvDesign: str(item['cv_design']) === undefined ? undefined : clip(str(item['cv_design']) ?? '', MAX_SUMMARY_CHARS),
  })).filter(item => item.statement.length > 0)
  return hypotheses.length === 0 ? undefined : hypotheses
}

function mapL3(value: unknown): LoopL3 | undefined {
  if (!isRecord(value)) return undefined
  const roundSummary = str(value['round_summary'])
  const seedVariance = str(value['seed_variance'])
  const multipleComparisons = str(value['multiple_comparisons'])
  const budgetFairness = str(value['budget_fairness'])
  const notes = str(value['notes'])
  const l3: LoopL3 = compact({
    roundSummary: roundSummary === undefined ? undefined : clip(roundSummary, MAX_SUMMARY_CHARS),
    seedVariance: seedVariance === undefined ? undefined : clip(seedVariance, MAX_SUMMARY_CHARS),
    multipleComparisons: multipleComparisons === undefined ? undefined : clip(multipleComparisons, MAX_SUMMARY_CHARS),
    budgetFairness: budgetFairness === undefined ? undefined : clip(budgetFairness, MAX_SUMMARY_CHARS),
    stopRecommended: bool(value['stop_recommended']),
    notes: notes === undefined ? undefined : clip(notes, MAX_SUMMARY_CHARS),
  })
  return Object.values(l3).some(entry => entry !== undefined) ? l3 : undefined
}

function mapVerifiedRun(value: Record<string, unknown>): LoopVerifiedRun | undefined {
  const runId = str(value['run_id'])
  if (runId === undefined) return undefined
  return compact({
    runId,
    label: str(value['label']),
    value: num(value['value']),
    seed: num(value['seed']),
  })
}

function mapDesign(value: Record<string, unknown>): LoopDesign | undefined {
  const best = isRecord(value['best']) ? mapVerifiedRun(value['best']) : undefined
  const verifiedRuns = Array.isArray(value['verified_runs'])
    ? value['verified_runs'].filter(isRecord).slice(0, MAX_VERIFIED_RUNS)
      .map(mapVerifiedRun)
      .filter((run): run is LoopVerifiedRun => run !== undefined)
    : []
  const design: LoopDesign = compact({
    baselineRunId: str(value['baseline_run_id']),
    baselineValue: num(value['baseline_value']),
    best,
    delta: num(value['delta_vs_baseline']),
    multipleComparisons: num(value['multiple_comparisons']),
    distinctOofTotal: num(value['distinct_oof_total']),
    verifiedRuns,
  })
  return Object.keys(design).length === 0 ? undefined : design
}

function mapCandidate(value: Record<string, unknown>): LoopCandidate | undefined {
  const runId = str(value['run_id'])
  if (runId === undefined) return undefined
  return compact({
    runId,
    verifiedMean: num(value['verified_mean']),
    verifiedSd: num(value['verified_sd']),
    seeds: num(value['seeds']),
    distinctPredictions: num(value['distinct_predictions']),
    note: str(value['note']) === undefined ? undefined : clip(str(value['note']) ?? '', MAX_SUMMARY_CHARS),
    costUsd: num(value['cost_usd']),
    rank: num(value['rank']),
  })
}

function mapBudget(value: unknown): Record<string, number | string> | undefined {
  if (!isRecord(value)) return undefined
  const entries: [string, number | string][] = []
  for (const [key, entry] of Object.entries(value)) {
    if (entries.length >= MAX_BUDGET_KEYS) break
    const number = num(entry)
    if (number !== undefined) entries.push([key, number])
    else if (typeof entry === 'string') entries.push([key, clip(entry, MAX_STATUS_CHARS)])
  }
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

function mapDecision(value: Record<string, unknown>): LoopDecision | undefined {
  const chosen = str(value['chosen_run_id'])
  const rationale = str(value['rationale_code'])
  const eliminated = Array.isArray(value['eliminated'])
    ? value['eliminated'].filter(isRecord).slice(0, 20).map(item => ({
      runId: str(item['run_id']) ?? '',
      reason: str(item['reason']) ?? '',
    }))
    : []
  const candidates = Array.isArray(value['candidates'])
    ? value['candidates'].filter(isRecord).slice(0, MAX_CANDIDATES)
      .map(mapCandidate)
      .filter((candidate): candidate is LoopCandidate => candidate !== undefined)
    : []
  const budgetUsed = mapBudget(value['budget_used'])
  if (chosen === undefined && rationale === undefined && eliminated.length === 0 && candidates.length === 0) return undefined
  return compact({
    chosenRunId: chosen,
    rationaleCode: rationale,
    eliminated,
    candidates,
    budgetUsed,
  })
}

function mapIssues(value: unknown): LoopReportIssue[] {
  if (!Array.isArray(value)) return []
  const issues: LoopReportIssue[] = []
  for (const item of value.slice(0, MAX_ISSUES)) {
    if (typeof item === 'string') {
      issues.push({ text: clip(item, MAX_SUMMARY_CHARS) })
      continue
    }
    if (!isRecord(item)) continue
    issues.push(compact({
      line: num(item['line']),
      token: str(item['token']) === undefined ? undefined : clip(str(item['token']) ?? '', 120),
      text: str(item['text']) === undefined ? undefined : clip(str(item['text']) ?? '', MAX_SUMMARY_CHARS),
      kind: str(item['kind']),
    }))
  }
  return issues
}

function mapReport(value: Record<string, unknown>, previous: LoopReport | undefined): LoopReport | undefined {
  const checks = isRecord(value['checks']) ? value['checks'] : undefined
  const path = str(value['path']) ?? (checks === undefined ? undefined : str(checks['path'])) ?? previous?.path
  const hasOk = checks === undefined ? value['ok'] !== undefined : checks['ok'] !== undefined
  const hasStrict = checks === undefined ? value['strict'] !== undefined : checks['strict'] !== undefined
  const hasIssues = checks === undefined ? Array.isArray(value['issues']) : Array.isArray(checks['issues'])
  if (path === undefined && !hasOk && !hasStrict && !hasIssues) return undefined
  const ok = checks === undefined ? bool(value['ok']) : bool(checks['ok'])
  const strict = checks === undefined ? bool(value['strict']) : bool(checks['strict'])
  const issues = checks === undefined ? mapIssues(value['issues']) : mapIssues(checks['issues'])
  return compact({
    path,
    ok: ok ?? previous?.ok,
    strict: strict ?? previous?.strict,
    issues: hasIssues ? issues : (previous?.issues ?? []),
  })
}

function applyWorkflowResult(
  state: LoopState,
  roundId: string | undefined,
  payload: Record<string, unknown>,
  failed: boolean,
  time: number,
): LoopState {
  const round = findRound(state, roundId)
  if (round === undefined) return state

  const scout = mapScout(payload['scout'])
  const hypotheses = mapHypotheses(payload['hypotheses'])
  const l3 = mapL3(payload['l3'])

  if (payload['started'] === false) {
    const reason = str(payload['reason']) ?? 'workflow stopped before starting'
    return withRound(state, recomputeStages({
      ...round,
      status: 'blocked',
      endedAt: time,
      workflow: { ...round.workflow, error: clip(reason, MAX_SUMMARY_CHARS) },
      ...(scout === undefined ? {} : { scout }),
      ...(hypotheses === undefined ? {} : { hypotheses }),
    }))
  }

  let next = withRound(state, recomputeStages({
    ...round,
    roundId: str(payload['roundId']) ?? round.roundId,
    mode: str(payload['mode']) ?? round.mode,
    ...(scout === undefined ? {} : { scout }),
    ...(hypotheses === undefined ? {} : { hypotheses }),
    ...(l3 === undefined ? {} : { l3 }),
    ...(failed ? { workflow: { ...round.workflow, error: 'workflow call failed' }, status: 'failed' as const, endedAt: time } : {}),
  }))
  // Stages the workflow deliberately did not run (a reused scout, a skipped L3 review) have no members;
  // mark them settled so they do not show as pending forever.
  const skipped: Array<[StageId, string]> = []
  if (payload['scoutReused'] === true) skipped.push(['scout', 'scout reused from an earlier round'])
  const l3Skipped = str(payload['l3Skipped'])
  if (l3Skipped !== undefined) skipped.push(['statistician', `L3 review skipped: ${l3Skipped}`])
  for (const [stageId, summary] of skipped) {
    next = updateRound(next, round.id, (current) => {
      const stage = current.stages[stageId]
      if (stage === undefined || stage.members.length > 0) return current
      return recomputeStages({
        ...current,
        stages: { ...current.stages, [stageId]: { ...stage, explicit: { status: 'completed', seq: time }, summary: clip(summary, MAX_SUMMARY_CHARS) } },
      })
    })
  }

  const results = Array.isArray(payload['results']) ? payload['results'] : []
  const current = findRound(next, round.id)
  if (current === undefined) return next
  results.forEach((item, index) => {
    if (!isRecord(item)) return
    const hypothesisId = str(item['hypothesis_id'])
    if (hypothesisId !== undefined) {
      next = applyEnrichedResult(next, current.id, hypothesisId, item)
      return
    }
    const legacyId = hypotheses?.[index]?.hypothesisId
    if (legacyId === undefined) return
    next = applyLegacyResult(next, current.id, legacyId, item)
  })
  return next
}

function applyEnrichedResult(state: LoopState, roundId: string, hypothesisId: string, item: Record<string, unknown>): LoopState {
  let next = state
  const engineer = isRecord(item['engineer']) ? item['engineer'] : undefined
  if (engineer !== undefined) {
    next = updateMemberByLabel(next, roundId, `engineer-${hypothesisId}`, member => applyRunToMember(member, engineer))
  }
  const repair = isRecord(item['repair']) ? item['repair'] : undefined
  if (repair !== undefined) {
    next = updateMemberByLabel(next, roundId, `repair-${hypothesisId}`, member => applyRunToMember(member, repair))
  }
  const verify = isRecord(item['verify']) ? item['verify'] : undefined
  if (verify !== undefined) {
    next = updateMemberByLabel(next, roundId, `verify-${hypothesisId}`, member => applyVerifyToMember(member, verify))
  }
  const reverify = isRecord(item['reverify']) ? item['reverify'] : undefined
  if (reverify !== undefined) {
    next = updateMemberByLabel(next, roundId, `reverify-${hypothesisId}`, member => applyVerifyToMember(member, reverify))
  }
  return next
}

function applyLegacyResult(state: LoopState, roundId: string, hypothesisId: string, item: Record<string, unknown>): LoopState {
  if (parseVerdict(item['verdict']) !== undefined) {
    let next = state
    for (const prefix of ['verify', 'reverify']) {
      next = updateMemberByLabel(next, roundId, `${prefix}-${hypothesisId}`, member => applyVerifyToMember(member, item))
    }
    return next
  }
  let next = state
  for (const prefix of ['engineer', 'repair']) {
    next = updateMemberByLabel(next, roundId, `${prefix}-${hypothesisId}`, member => applyRunToMember(member, item))
  }
  return next
}
