/**
 * Projection definition for the research loop. The registry owns the fold
 * drive, per-session cache, replay, and client delivery; this unit owns the
 * pure transition and the wire view.
 */

import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { researchStateSchema, researchViewSchema, type ResearchState, type ResearchView } from '../shared/schema.ts'
import { toCampaignView } from './campaign-view.ts'
import { initResearchState, reduceResearchEvent } from './reduce.ts'

/**
 * Wire view: the state without pending call bindings. Runs, papers, and the ledger keep
 * their references, and the fold already bounds them; campaign rounds are capped and clipped.
 * @param state - fold state.
 * @returns the browser view.
 */
export function toResearchView(state: ResearchState): ResearchView {
  const view: ResearchView = {
    v: 3,
    runs: state.runs,
    papers: state.papers,
    campaign: toCampaignView(state.campaign),
    agentPreset: state.agentPreset,
    skillLoaded: state.skillLoaded,
  }
  // The view crosses the wire as lossless JSON, so an absent ledger is omitted rather than `undefined`.
  return state.ledger === undefined ? view : { ...view, ledger: state.ledger }
}

/** The research loop projection unit registered by the host plugin. */
export const researchLoopProjection = {
  key: 'scienceResearchLoop',
  stateVersion: 3,
  stateSchema: researchStateSchema,
  init: header => initResearchState(header.agentPreset ?? null),
  apply: reduceResearchEvent,
  wire: {
    viewSchema: researchViewSchema,
    view: toResearchView,
  },
} satisfies ProjectionDefinition<'scienceResearchLoop', ResearchState>
