/**
 * Conversation Definitions that place one card at each `research-loop` run
 * start and one at each `paper-writing` run start. Content is read live from
 * the host projection; the Definition state only remembers which run a card
 * represents.
 */

import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { PAPER_WORKFLOW, RESEARCH_WORKFLOW } from '../shared/constants.ts'

/** Identity carried by the card node. */
export interface ResearchLoopAnchorData {
  /** Workflow run id of the run the card represents. */
  readonly runId: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One research loop run anchored in the transcript. */
    'research-loop': ResearchLoopAnchorData
    /** One paper-writing run anchored in the transcript. */
    'research-paper': ResearchLoopAnchorData
  }
}

function runCardDefinition(kind: 'research-loop' | 'research-paper', workflow: string): ConversationNodeDefinition<ResearchLoopAnchorData> {
  return {
    kind,
    target: 'chat',
    match: event => (event.type === 'tool-workflow/run-start' && event.data.name === workflow
      ? { id: `${kind}:${String(event.data.runId)}`, role: 'start' }
      : null),
    start: (_context, match) => ({ runId: match.event.type === 'tool-workflow/run-start' ? String(match.event.data.runId) : '' }),
    update: context => context.state,
    buildViewNode: (context): ChatConversationViewNode | null => {
      if (context.start === undefined || context.state === undefined) return null
      return {
        key: context.key,
        kind,
        id: context.id,
        target: 'chat',
        anchorSeq: context.start.event.seq,
        location: context.start.location,
        visibility: 'visible',
        data: context.state,
      }
    },
  }
}

/** Fold each `research-loop` run start into a card placed at that log position. */
export const researchLoopDefinition = runCardDefinition('research-loop', RESEARCH_WORKFLOW)

/** Fold each `paper-writing` run start into a card placed at that log position. */
export const researchPaperDefinition = runCardDefinition('research-paper', PAPER_WORKFLOW)
