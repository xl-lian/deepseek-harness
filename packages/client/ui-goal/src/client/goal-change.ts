/**
 * Chat cards for durable goal lifecycle milestones. A `goal/change` event
 * whose operation creates, completes, or blocks a goal becomes one card at
 * the event's position; edits, pauses, resumes, and clears stay on the goal
 * strip. Event data crosses the durable history boundary untyped, so the card
 * decodes only the fields it renders and ignores any record it cannot read.
 */
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Goal operations that open a chat card. */
export type GoalChangeCardOperation = 'create' | 'complete' | 'block'

/** Renderable facts of one goal lifecycle milestone, copied from its durable event. */
export interface GoalChangeCardData {
  /** Lifecycle milestone this card announces. */
  readonly operation: GoalChangeCardOperation
  /** Goal objective at the milestone. */
  readonly objective: string
  /** Admitted continuation rounds at the milestone. */
  readonly roundsStarted: number
  /** Configured round cap at the milestone. */
  readonly maxGoalRounds: number
  /** Human-readable blocker; present only for `block`. */
  readonly blockedReason?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Goal creation, completion, or blocking milestone. */
    'goal-change': GoalChangeCardData
  }
}

const CARD_OPERATIONS: ReadonlySet<string> = new Set<GoalChangeCardOperation>(['create', 'complete', 'block'])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Decode one durable event into card data.
 * @param event - Client history event with untyped data.
 * @returns card data for a readable create, complete, or block change; otherwise undefined.
 */
export function goalChangeCard(event: { readonly type: string; readonly data: unknown }): GoalChangeCardData | undefined {
  if (event.type !== 'goal/change') return undefined
  const data = event.data
  if (!record(data) || typeof data.operation !== 'string' || !CARD_OPERATIONS.has(data.operation)) return undefined
  const goal = data.goal
  if (!record(goal) || typeof goal.objective !== 'string' || !count(goal.maxGoalRounds) || !count(data.roundsStarted)) {
    return undefined
  }
  const operation = data.operation as GoalChangeCardOperation
  const reason = record(goal.blockedReason) && typeof goal.blockedReason.message === 'string'
    ? goal.blockedReason.message
    : undefined
  return {
    operation,
    objective: goal.objective,
    roundsStarted: data.roundsStarted,
    maxGoalRounds: goal.maxGoalRounds,
    ...operation === 'block' && reason !== undefined ? { blockedReason: reason } : {},
  }
}

/**
 * One card per milestone event, kept outside the Turn's folded process so an
 * autonomous run's completion or blocker stays visible.
 */
export const goalChangeDefinition: ConversationNodeDefinition<GoalChangeCardData> = {
  kind: 'goal-change',
  target: 'chat',
  match: event => goalChangeCard(event) === undefined ? null : { id: String(event.seq), role: 'start' },
  start: (_context, match) => goalChangeCard(match.event) as GoalChangeCardData,
  update: context => context.state,
  buildViewNode: (context) => {
    const start = context.start
    if (context.state === undefined || start === undefined) return null
    return {
      key: context.key, kind: 'goal-change', id: context.id, target: 'chat',
      anchorSeq: start.event.seq, location: start.location,
      visibility: 'visible', groupTree: 'turn', data: context.state,
    } satisfies ChatNode<'goal-change'>
  },
}
