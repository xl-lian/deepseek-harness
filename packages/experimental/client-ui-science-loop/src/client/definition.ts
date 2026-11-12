/**
 * Conversation Definition that places one science-loop card per round at the
 * round's canonical anchor. Content is read live from the host projection; the
 * Definition state only remembers which anchor this Context represents.
 */

import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { SCIENCE_WORKFLOWS, callAnchorId, classifyToolCall, runAnchorId } from '../shared/classify.ts'

/** Identity carried by the card node. */
export interface ScienceLoopAnchorData {
  readonly anchorId: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One science-agent round anchored in the transcript. */
    'science-loop': ScienceLoopAnchorData
  }
}

/** Fold the canonical anchor event into a card placed at that log position. */
export const scienceLoopDefinition: ConversationNodeDefinition<ScienceLoopAnchorData> = {
  kind: 'science-loop',
  target: 'chat',
  match: (event) => {
    if (event.type === 'tool-workflow/run-start' && SCIENCE_WORKFLOWS.has(event.data.name)) {
      return { id: runAnchorId(String(event.data.runId)), role: 'start' }
    }
    if (event.type === 'tool/call') {
      const classifications = classifyToolCall(event.data.name, event.data.arguments)
      if (classifications.some(classification => classification.anchors)) {
        return { id: callAnchorId(event.data.callId), role: 'start' }
      }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type === 'tool-workflow/run-start') {
      return { anchorId: runAnchorId(String(match.event.data.runId)) }
    }
    if (match.event.type === 'tool/call') {
      return { anchorId: callAnchorId(match.event.data.callId) }
    }
    return { anchorId: '' }
  },
  update: context => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    return {
      key: context.key,
      kind: 'science-loop',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: context.state,
    }
  },
}
