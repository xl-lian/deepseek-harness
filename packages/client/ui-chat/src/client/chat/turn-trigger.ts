/** Presentation of durable non-human messages claimed to begin a Turn. */
import type { ContextMessageNode } from '../contract/snapshot.ts'
import type { ChatKey } from '../locale.ts'

/** Existing primitive glyph selected for a Turn trigger's source family. */
export type TurnTriggerIcon = 'agent' | 'github' | 'goal' | 'job' | 'plugin' | 'request' | 'schedule' | 'subagent' | 'team' | 'webhook'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function field(source: Record<string, unknown>, key: string): string {
  return typeof source[key] === 'string' ? source[key] : ''
}

/** Recorded positive goal-round number, or undefined for a missing or malformed value. */
function goalRound(source: Record<string, unknown>): number | undefined {
  const round = source.round
  return typeof round === 'number' && Number.isSafeInteger(round) && round > 0 ? round : undefined
}

/**
 * Describe a waking message using its recorded source.
 * @param node - durable context, including the original notification body.
 * @returns localized title key with its interpolation values, explanation key, source-family icon, and source kind.
 */
export function turnTriggerDetails(node: ContextMessageNode): {
  title: ChatKey
  params?: Record<string, number>
  explanation: ChatKey
  icon: TurnTriggerIcon
  kind: string
} {
  const source = record(node.source)
  const kind = field(source, 'kind')
  let title: ChatKey = 'message.trigger.request'
  let explanation: ChatKey = 'message.trigger.explanation'
  let icon: TurnTriggerIcon = 'request'
  switch (kind) {
    case 'goal': {
      icon = 'goal'
      explanation = 'message.trigger.goal.explanation'
      const round = goalRound(source)
      if (round !== undefined) return { title: 'message.trigger.goal.round', params: { round }, explanation, icon, kind }
      title = 'message.trigger.goal'
      break
    }
    case 'agent-message':
      title = 'message.trigger.agent'
      icon = 'agent'
      break
    case 'team-message':
      title = 'message.trigger.team'
      icon = 'team'
      break
    case 'subagent-settled': {
      title = 'message.trigger.subagent'
      icon = 'subagent'
      break
    }
    case 'webhook': {
      const github = field(source, 'provider') === 'github'
      title = github ? 'message.trigger.github' : 'message.trigger.webhook'
      icon = github ? 'github' : 'webhook'
      break
    }
    case 'schedule':
      title = 'message.trigger.schedule'
      icon = 'schedule'
      break
    case 'tool-jobs':
      title = 'message.trigger.job'
      icon = 'job'
      break
    case 'cordis-host-runner':
      title = 'message.trigger.plugin'
      icon = 'plugin'
      break
    default:
      // Custom sources remain visible without attributing unrecorded identity or success.
      break
  }
  return { title, explanation, icon, kind }
}
