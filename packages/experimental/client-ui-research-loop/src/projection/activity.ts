/**
 * Projection of the work the agent does outside a recorded loop: shell
 * commands and file writes and edits, grouped by turn, with background jobs
 * followed until they settle. Calls that a research, paper, or campaign loop
 * records (any `sagent` command, `workflow` call, science-agent MCP tool, or
 * role tool) are left out. A pure fold over committed Session events that
 * returns the same state reference for unrelated events.
 */

import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-jobs'
import {
  activityStateSchema,
  activityViewSchema,
  type ActivityState,
  type ActivityStatus,
  type ActivityStep,
  type ActivityTurn,
  type ActivityView,
} from '../shared/activity-schema.ts'
import { classifyToolCall, sagentInvocations } from '../shared/classify.ts'
import { SHORT_TEXT, clip, compact, parseObject, pushBounded, str, textOf } from './fold-util.ts'

const MAX_TURNS = 12
const MAX_STEPS = 40
const MAX_FILES = 12
const MAX_COMMAND = 200
const MAX_JOBS = 50

/**
 * Empty activity state.
 * @returns state with no turns.
 */
export function initActivityState(): ActivityState {
  return { v: 1, turns: [], calls: {}, jobs: {} }
}

/**
 * Fold one committed event into the activity state.
 * @param state - current state.
 * @param event - the next committed Session event.
 * @returns the next state, or `state` itself when the event is unrelated.
 */
export function reduceActivityEvent(state: ActivityState, event: SessionEvent): ActivityState {
  switch (event.type) {
    case 'turn/start':
      return compact({ ...state, turn: event.data.turn, headline: undefined })
    case 'user/message':
      return event.data.source.kind === 'user' ? onPrompt(state, textOf(event.data.content)) : state
    case 'tool/call':
      return onToolCall(state, event.data.turn, event.data.callId, event.data.name, event.data.arguments, event.time)
    case 'tool/result':
      return onToolResult(state, event.data.message.toolCallId, event.data.message.isError === true, event.data.error?.reason, event.time)
    case 'job/registered':
      return onJobRegistered(state, String(event.data.jobId), event.data.toolCall?.rootCallId)
    case 'job/settled':
      return onJobSettled(state, String(event.data.jobId), event.data.status, event.data.finishedAt, event.data.detail)
    case 'turn/end':
      return onTurnEnd(state, event.data.turn, event.data.reason.kind, event.time)
    default:
      return state
  }
}

function onPrompt(state: ActivityState, text: string): ActivityState {
  const headline = clip(text.trim().replace(/\s+/gu, ' '), SHORT_TEXT)
  if (headline === '' || state.headline !== undefined) return state
  return { ...state, headline }
}

/** The step a tool call contributes, or `undefined` for a loop call or a tool the log does not follow. */
function stepOf(callId: string, name: string, argumentsJson: string, time: number): ActivityStep | undefined {
  if (classifyToolCall(name, argumentsJson).length > 0) return undefined
  const args = parseObject(argumentsJson)
  if (name === 'bash' || name === 'pwsh') {
    const command = str(args?.['command'], MAX_COMMAND)
    if (command === undefined || sagentInvocations(command).length > 0) return undefined
    return compact({
      callId, kind: 'command' as const, label: str(args?.['description'], SHORT_TEXT) ?? command,
      command, status: 'running' as const, startedAt: time, background: false,
    })
  }
  if (name === 'edit' || name === 'write') {
    const path = str(args?.['file_path'], SHORT_TEXT)
    if (path === undefined) return undefined
    return { callId, kind: name, label: path, status: 'running', startedAt: time, background: false }
  }
  return undefined
}

function onToolCall(state: ActivityState, turn: number, callId: string, name: string, argumentsJson: string, time: number): ActivityState {
  const step = stepOf(callId, name, argumentsJson, time)
  if (step === undefined) return state
  const existing = state.turns.find(candidate => candidate.turn === turn)
  const base: ActivityTurn = existing ?? compact({
    turn, headline: state.turn === turn ? state.headline : undefined, status: 'running' as const, startedAt: time, steps: [], dropped: 0, files: [],
  })
  const files = step.kind === 'command' || base.files.includes(step.label) || base.files.length >= MAX_FILES ? base.files : [...base.files, step.label]
  const next: ActivityTurn = base.steps.length >= MAX_STEPS
    ? { ...base, dropped: base.dropped + 1, files }
    : { ...base, steps: [...base.steps, step], files }
  const turns = existing === undefined
    ? pushBounded(state.turns, next, MAX_TURNS)
    : state.turns.map(candidate => (candidate === existing ? next : candidate))
  return { ...state, turns, calls: { ...state.calls, [callId]: turn } }
}

function updateStep(state: ActivityState, turn: number, callId: string, update: (step: ActivityStep) => ActivityStep): ActivityTurn[] {
  return state.turns.map(candidate => (candidate.turn !== turn
    ? candidate
    : { ...candidate, steps: candidate.steps.map(step => (step.callId === callId ? update(step) : step)) }))
}

function findStep(state: ActivityState, callId: string): { readonly turn: number; readonly step: ActivityStep } | undefined {
  for (const turn of state.turns) {
    const step = turn.steps.find(candidate => candidate.callId === callId)
    if (step !== undefined) return { turn: turn.turn, step }
  }
  return undefined
}

function onToolResult(state: ActivityState, callId: string, failed: boolean, reason: string | undefined, time: number): ActivityState {
  const turn = state.calls[callId]
  if (turn === undefined) return state
  const { [callId]: _settled, ...calls } = state.calls
  // A job still registered when its tool call returns keeps running in the background.
  const background = Object.values(state.jobs).includes(callId)
  const turns = updateStep(state, turn, callId, step => (background
    ? { ...step, background: true }
    : compact({ ...step, status: failed ? 'failed' as const : 'completed' as const, endedAt: time, detail: failed && reason !== undefined ? clip(reason, SHORT_TEXT) : undefined })))
  return { ...state, turns, calls }
}

function onJobRegistered(state: ActivityState, jobId: string, callId: string | undefined): ActivityState {
  if (callId === undefined) return state
  const found = findStep(state, callId)
  if (found === undefined) return state
  const kept = Object.entries(state.jobs).slice(-(MAX_JOBS - 1))
  return {
    ...state,
    jobs: { ...Object.fromEntries(kept), [jobId]: callId },
    turns: updateStep(state, found.turn, callId, step => ({ ...step, jobId })),
  }
}

function jobStatus(status: 'completed' | 'killed' | 'failed'): ActivityStatus {
  return status === 'completed' ? 'completed' : status === 'killed' ? 'cancelled' : 'failed'
}

function onJobSettled(state: ActivityState, jobId: string, status: 'completed' | 'killed' | 'failed', finishedAt: number, detail: string | undefined): ActivityState {
  const callId = state.jobs[jobId]
  if (callId === undefined) return state
  const { [jobId]: _settled, ...jobs } = state.jobs
  const found = findStep(state, callId)
  // A foreground command settles before its tool result, which then records the outcome.
  if (found?.step.background !== true) return { ...state, jobs }
  const turns = updateStep(state, found.turn, callId, step => compact({
    ...step, status: jobStatus(status), endedAt: finishedAt, detail: detail === undefined ? undefined : clip(detail, SHORT_TEXT),
  }))
  return { ...state, turns, jobs }
}

function turnStatus(kind: string): ActivityStatus {
  switch (kind) {
    case 'completed':
      return 'completed'
    case 'interrupted':
    case 'forked':
    case 'aborted':
      return 'cancelled'
    default:
      // `error`, `blocked`, `max-tokens`, and reasons other plugins add.
      return 'failed'
  }
}

function onTurnEnd(state: ActivityState, turn: number, kind: string, time: number): ActivityState {
  const open = state.turn === turn ? compact({ ...state, turn: undefined, headline: undefined }) : state
  const record = open.turns.find(candidate => candidate.turn === turn)
  if (record === undefined) return open
  const calls = Object.fromEntries(Object.entries(open.calls).filter(([, owner]) => owner !== turn))
  const status = turnStatus(kind)
  const steps = record.steps.map(step => (step.status !== 'running' || step.background
    ? step
    : { ...step, status: status === 'completed' ? 'completed' as const : 'cancelled' as const, endedAt: time }))
  const closed: ActivityTurn = { ...record, status, endedAt: time, steps }
  return { ...open, calls, turns: open.turns.map(candidate => (candidate === record ? closed : candidate)) }
}

/**
 * Wire view: the turns only.
 * @param state - fold state.
 * @returns the browser view.
 */
export function toActivityView(state: ActivityState): ActivityView {
  return { v: 1, turns: state.turns }
}

/** The activity projection unit registered by the host plugin. */
export const activityProjection = {
  key: 'scienceResearchActivity',
  stateVersion: 1,
  stateSchema: activityStateSchema,
  init: () => initActivityState(),
  apply: reduceActivityEvent,
  wire: {
    viewSchema: activityViewSchema,
    view: toActivityView,
  },
} satisfies ProjectionDefinition<'scienceResearchActivity', ActivityState>
