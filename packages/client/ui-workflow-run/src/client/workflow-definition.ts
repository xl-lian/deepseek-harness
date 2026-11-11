import type {
  ConversationLocation, ConversationNodeContext, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ToolWorkflowAgentEndData, ToolWorkflowAgentStartData, ToolWorkflowLogData, ToolWorkflowPhaseData,
} from '@deepseek-ai/dsh-tool-workflow/types'
import type { WorkflowAgentOutcome, WorkflowStopReason } from '@deepseek-ai/dsh-workflow/types'

/** Status shown for a workflow, phase, or member. */
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

/** Final renderer data for one member. */
export interface WorkflowRunMemberData {
  readonly seq: number
  readonly label: string
  readonly childId: SessionId
  readonly status: WorkflowRunStatus
  /** Unix epoch milliseconds of the member's recorded start. */
  readonly startedAt: number
  /** Unix epoch milliseconds of the member's recorded settlement. */
  readonly endedAt?: number
}

/** One recorded `phase()` or `log()` call, in log order. */
export interface WorkflowRunActivityEntry {
  /** Session sequence number of the record. */
  readonly seq: number
  readonly kind: 'phase' | 'log'
  readonly text: string
}

/** Final renderer data for one exact phase identity. */
export interface WorkflowRunPhaseData {
  readonly key: string
  /** `null` is the absent field; the empty string remains a distinct identity. */
  readonly phase: string | null
  readonly members: readonly WorkflowRunMemberData[]
}

/** Final keyed Chat payload for one workflow run. */
export interface WorkflowRunChatData {
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly phases: readonly WorkflowRunPhaseData[]
  /** Unix epoch milliseconds of the run's recorded start. */
  readonly startedAt: number
  /** Unix epoch milliseconds of the run's recorded settlement. */
  readonly endedAt?: number
  /** Title of the latest recorded `phase()` call. */
  readonly currentPhase?: string
  readonly activity: readonly WorkflowRunActivityEntry[]
  /** Progress records the Host skipped under its recording caps. */
  readonly progressEventsDropped: number
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Durable top-level workflow run and all members that actually started. */
    'workflow-run': WorkflowRunChatData
  }
}

interface WorkflowMemberState extends Omit<ToolWorkflowAgentStartData, 'runId'> {
  readonly outcome?: WorkflowAgentOutcome
  readonly startedAt: number
  readonly endedAt?: number
}

interface WorkflowState {
  readonly name: string
  readonly stopReason?: WorkflowStopReason
  readonly members: readonly WorkflowMemberState[]
  readonly startedAt: number
  readonly endedAt?: number
  readonly activity: readonly WorkflowRunActivityEntry[]
  readonly progressEventsDropped: number
}

/**
 * Build a collision-free phase key preserving absent versus empty identity.
 * @param phase - exact phase string, or null for an omitted field.
 * @returns the stable renderer key for that phase identity.
 */
export function workflowPhaseKey(phase: string | null): string {
  return phase === null ? 'missing' : `value:${phase.length}:${phase}`
}

function statusFromStopReason(stopReason: WorkflowStopReason): WorkflowRunStatus {
  switch (stopReason) {
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'error': return 'failed'
    /* v8 ignore next -- WorkflowStopReason is closed and every variant is handled above. */
    default: return stopReason satisfies never
  }
}

function statusFromOutcome(outcome: WorkflowAgentOutcome): WorkflowRunStatus {
  switch (outcome) {
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'failed': return 'failed'
    /* v8 ignore next -- WorkflowAgentOutcome is closed and every variant is handled above. */
    default: return outcome satisfies never
  }
}

/**
 * A foreground run writes its run-end before its Tool Step ends, and a
 * background run outlives that Step, so an ordinary Step or Turn closure says
 * nothing about liveness. Only a Turn closed after a crash or at a fork
 * boundary proves that a run without run-end stopped.
 */
function turnAbandoned(location: ConversationLocation): boolean {
  if (location.kind !== 'step' && location.kind !== 'turn') return false
  const reason = location.turn.end?.data.reason.kind
  return reason === 'interrupted' || reason === 'forked'
}

function projectWorkflow(
  context: ConversationNodeContext<WorkflowState>,
  location: ConversationLocation,
): WorkflowRunChatData {
  const state = context.state as WorkflowState
  const interrupted = state.stopReason === undefined
    && turnAbandoned(location)
  const phases = new Map<string, { phase: string | null; members: WorkflowRunMemberData[] }>()
  for (const member of state.members) {
    const phase = member.phase === undefined ? null : member.phase
    const key = workflowPhaseKey(phase)
    let group = phases.get(key)
    if (group === undefined) {
      group = { phase, members: [] }
      phases.set(key, group)
    }
    group.members.push({
      seq: member.seq,
      label: member.label,
      childId: member.childId,
      status: member.outcome === undefined
        ? interrupted ? 'interrupted' : 'running'
        : statusFromOutcome(member.outcome),
      startedAt: member.startedAt,
      ...member.endedAt === undefined ? {} : { endedAt: member.endedAt },
    })
  }
  const currentPhase = state.activity.findLast(entry => entry.kind === 'phase')
  const projectedPhases = [...phases].map(([key, phase]) => ({
    key,
    phase: phase.phase,
    members: phase.members,
  }))
  return {
    name: state.name,
    status: state.stopReason === undefined
      ? interrupted ? 'interrupted' : 'running'
      : statusFromStopReason(state.stopReason),
    phases: projectedPhases,
    startedAt: state.startedAt,
    ...state.endedAt === undefined ? {} : { endedAt: state.endedAt },
    ...currentPhase === undefined ? {} : { currentPhase: currentPhase.text },
    activity: state.activity,
    progressEventsDropped: state.progressEventsDropped,
  }
}

function updateAgentStart(state: WorkflowState, data: ToolWorkflowAgentStartData, time: number): WorkflowState {
  const member: WorkflowMemberState = {
    seq: data.seq,
    label: data.label,
    ...data.phase === undefined ? {} : { phase: data.phase },
    childId: data.childId,
    startedAt: time,
  }
  return { ...state, members: [...state.members, member] }
}

function updateProgress(
  state: WorkflowState,
  seq: number,
  kind: WorkflowRunActivityEntry['kind'],
  data: ToolWorkflowPhaseData | ToolWorkflowLogData,
): WorkflowState {
  return { ...state, activity: [...state.activity, { seq, kind, text: 'title' in data ? data.title : data.message }] }
}

function updateAgentEnd(state: WorkflowState, data: ToolWorkflowAgentEndData, time: number): WorkflowState {
  return {
    ...state,
    members: state.members.map(member => member.seq === data.seq
      ? { ...member, outcome: data.outcome, endedAt: time }
      : member),
  }
}

/** Durable workflow event family folded into one keyed Chat node. */
export const workflowRunDefinition: ConversationNodeDefinition<WorkflowState> = {
  kind: 'workflow-run',
  target: 'chat',
  match: (event) => {
    if (event.type === 'tool-workflow/run-start') return { id: String(event.data.runId), role: 'start' }
    if (event.type === 'tool-workflow/agent-start'
      || event.type === 'tool-workflow/agent-end'
      || event.type === 'tool-workflow/phase'
      || event.type === 'tool-workflow/log'
      || event.type === 'tool-workflow/run-end') {
      return { id: String(event.data.runId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'tool-workflow/run-start') {
      throw new Error('workflow-run start requires tool-workflow/run-start')
    }
    return {
      name: match.event.data.name,
      members: [],
      startedAt: match.event.time,
      activity: [],
      progressEventsDropped: 0,
    }
  },
  update: (context, match) => {
    if (match.event.type === 'tool-workflow/agent-start') {
      return updateAgentStart(context.state, match.event.data, match.event.time)
    }
    if (match.event.type === 'tool-workflow/agent-end') {
      return updateAgentEnd(context.state, match.event.data, match.event.time)
    }
    if (match.event.type === 'tool-workflow/phase') {
      return updateProgress(context.state, match.event.seq, 'phase', match.event.data)
    }
    if (match.event.type === 'tool-workflow/log') {
      return updateProgress(context.state, match.event.seq, 'log', match.event.data)
    }
    if (match.event.type === 'tool-workflow/run-end') {
      return {
        ...context.state,
        stopReason: match.event.data.stopReason,
        endedAt: match.event.time,
        progressEventsDropped: match.event.data.progressEventsDropped ?? 0,
      }
    }
    return context.state
  },
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined) return null
    const data = projectWorkflow(context, context.start.location)
    return {
      key: context.key,
      kind: 'workflow-run',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data,
    }
  },
}
