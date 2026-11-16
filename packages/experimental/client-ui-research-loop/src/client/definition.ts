/**
 * Conversation Definitions that place one card at each `research-loop` run
 * start, one at each `paper-writing` run start, and one at each campaign
 * round's canonical anchor. Content is read live from the host projection; the
 * Definition state only remembers which run or round a card represents.
 */

import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { SCIENCE_WORKFLOWS, callAnchorId, classifyToolCall, runAnchorId } from '../shared/classify.ts'
import { PAPER_WORKFLOW, RESEARCH_WORKFLOW } from '../shared/constants.ts'

/** Identity carried by the card node. */
export interface ResearchLoopAnchorData {
  /** Workflow run id of the run the card represents. */
  readonly runId: string
}

/** Identity carried by a campaign round card. */
export interface CampaignAnchorData {
  /** Round anchor id (`run:<runId>` or `call:<callId>`) the card represents. */
  readonly anchorId: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One research loop run anchored in the transcript. */
    'research-loop': ResearchLoopAnchorData
    /** One paper-writing run anchored in the transcript. */
    'research-paper': ResearchLoopAnchorData
    /** One campaign round anchored in the transcript. */
    'research-campaign': CampaignAnchorData
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

/** Fold each campaign round's canonical anchor (its workflow run start or first `sagent` round step) into a card. */
export const researchCampaignDefinition: ConversationNodeDefinition<CampaignAnchorData> = {
  kind: 'research-campaign',
  target: 'chat',
  match: (event) => {
    if (event.type === 'tool-workflow/run-start' && SCIENCE_WORKFLOWS.has(event.data.name)) {
      return { id: runAnchorId(String(event.data.runId)), role: 'start' }
    }
    if (event.type === 'tool/call' && classifyToolCall(event.data.name, event.data.arguments).some(classification => classification.anchors)) {
      return { id: callAnchorId(event.data.callId), role: 'start' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type === 'tool-workflow/run-start') return { anchorId: runAnchorId(String(match.event.data.runId)) }
    return { anchorId: match.event.type === 'tool/call' ? callAnchorId(match.event.data.callId) : '' }
  },
  update: context => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    return {
      key: context.key,
      kind: 'research-campaign',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: context.state,
    }
  },
}
