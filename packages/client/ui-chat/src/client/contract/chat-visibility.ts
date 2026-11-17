/** Chat-only row visibility; durable events and trajectory inspection remain intact. */
import type { ChatNode } from './chat-nodes.ts'

/**
 * Exclude system prompts, ordinary Context, permission commands, and command
 * results presented by their cited domain event from visible Chat rows.
 * Context containing tool changes retains its notice row. A successful command
 * whose result cites `sourceEventSeq` defers to the presentation of that
 * earlier domain event, so the generic command row would duplicate it.
 * @param node - projected Chat node.
 * @returns whether the node contributes a visible Chat row.
 */
export function isVisibleChatNode(node: ChatNode): boolean {
  return node.visibility === 'visible'
    && node.kind !== 'system-prompt'
    && (node.kind !== 'context'
      || node.data.content.some(block => block.type === 'tool-addition' || block.type === 'tool-removal'))
    && !(node.kind === 'command' && node.data.name === 'permission')
    && !(node.kind === 'command' && node.data.outcome?.kind === 'success' && node.data.outcome.sourceEventSeq !== undefined)
}
