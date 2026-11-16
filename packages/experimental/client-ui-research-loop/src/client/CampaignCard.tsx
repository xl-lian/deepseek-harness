/**
 * Chat card for one campaign round: seven stages with live status, per-stage
 * member details, and links to the run artifacts and child sessions.
 */

import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGE_ROLE, STAGES, type LoopRound, type StageId } from '../shared/campaign-types.ts'
import type {} from './definition.ts'
import { StageDetails, StageSummaryLines } from './campaign-parts.tsx'
import { formatDuration } from './model.ts'
import type { ResearchTranslate } from './parts.tsx'
import { stageSummary } from './summary.ts'
import type { ResearchView } from '../shared/schema.ts'

/** Navigation actions injected from the plugin's client services. */
export interface CampaignCardInjected {
  /** Open one member's child Session of `parentSessionId` in the workspace. */
  readonly openChild: (parentSessionId: SessionId, childId: string) => void
  /** Open the notebook tab in the right Sidebar. */
  readonly openNotebook: () => void
}

/** Complete keyed Chat renderer props for the campaign card. */
export type CampaignCardProps =
  & PropsRuntime<'conversation.chat.node', 'research-campaign'>
  & PropsLocale<'researchLoop'>
  & CampaignCardInjected

function findRound(rounds: readonly LoopRound[], anchorId: string): LoopRound | undefined {
  // A campaign run anchors every round it runs; its card follows the latest one.
  return rounds.findLast(round => round.anchor.id === anchorId)
}

/** Chat node slot occupant: reads the projection and renders {@link CampaignCardBody} for its round. */
export function CampaignCard({
  node, useProjection, openFile, openChild, openNotebook, sessionId, t,
}: CampaignCardProps): React.JSX.Element | null {
  return (
    <CampaignCardBody
      view={useProjection('scienceResearchLoop')}
      anchorId={node.data.anchorId}
      openFile={(path) => { openFile(path) }}
      openSessionFor={(childId) => { openChild(sessionId, childId) }}
      openNotebook={openNotebook}
      t={t}
    />
  )
}

/** Props of {@link CampaignCardBody}. */
export interface CampaignCardBodyProps {
  /** Projection view, or `undefined` before the first snapshot. */
  readonly view: ResearchView | undefined
  /** Anchor id of the round the card represents. */
  readonly anchorId: string
  /** Open a workspace-relative file in the right Sidebar. */
  readonly openFile: (path: string) => void
  /** Open one member's child Session. */
  readonly openSessionFor: (childId: string) => void
  /** Open the notebook tab in the right Sidebar. */
  readonly openNotebook: () => void
  readonly t: ResearchTranslate
}

/** Render one campaign round's card with live stage highlighting; nothing when no round owns the anchor. */
export function CampaignCardBody({
  view, anchorId, openFile, openSessionFor, openNotebook, t,
}: CampaignCardBodyProps): React.JSX.Element | null {
  const [openStage, setOpenStage] = useState<StageId | null>(null)
  const round = view === undefined ? undefined : findRound(view.campaign.rounds, anchorId)
  if (round === undefined) return null

  const now = Date.now()
  const elapsed = (round.endedAt ?? now) - (round.startedAt ?? now)
  const activeMembers = STAGES.reduce(
    (count, id) => count + round.stages[id].members.filter(member => member.status === 'running').length,
    0,
  )

  return (
    <article className="rlc-card" data-status={round.status}>
      <header className="rlc-header">
        <span className="rl-dot" data-status={round.status} aria-hidden="true" />
        <span className="rlc-title">{t('campaign.title')}</span>
        {round.roundId === undefined ? null : <code className="rlc-round-id">{round.roundId}</code>}
        {round.mode === undefined ? null : <span className="rlc-mode">{round.mode}</span>}
        <span className="rlc-status">{t(`status.${round.status}`)}</span>
        {activeMembers === 0
          ? null
          : <span className="rlc-running">{t('campaign.header.running', { count: String(activeMembers) })}</span>}
        <span className="rlc-elapsed">{t('campaign.header.elapsed', { time: formatDuration(elapsed) })}</span>
        <button type="button" className="rlc-expand" onClick={openNotebook}>{t('campaign.header.expand')}</button>
      </header>

      <ol className="rlc-stages">
        {STAGES.map((id, index) => {
          const stage = round.stages[id]
          const expanded = openStage === id
          return (
            <li
              key={id}
              className="rlc-stage"
              data-stage={id}
              data-status={stage.status}
              aria-current={stage.status === 'running' ? 'step' : undefined}
            >
              {index === 0 ? null : <span className="rlc-connector" aria-hidden="true" />}
              <button
                type="button"
                className="rlc-stage-button"
                aria-expanded={expanded}
                onClick={() => { setOpenStage(expanded ? null : id) }}
              >
                <span className="rl-dot" data-status={stage.status} aria-hidden="true" />
                <span className="rlc-stage-name">{t(`campaign.stage.${id}`)}</span>
                <span className="rlc-stage-role">{STAGE_ROLE[id]}</span>
                {stage.members.length === 0
                  ? null
                  : <span className="rlc-stage-count">{String(stage.members.length)}</span>}
                {stage.verdict === undefined
                  ? null
                  : <span className="rlc-verdict" data-verdict={stage.verdict}>{stage.verdict}</span>}
                <StageSummaryLines lines={stageSummary(round, id, t).slice(0, 1)} className="rlc-node-summary" />
              </button>
              {expanded
                ? (
                  <StageDetails
                    stage={stage}
                    round={round}
                    openFile={openFile}
                    openSessionFor={openSessionFor}
                    t={t}
                    summaryLines={stageSummary(round, id, t)}
                  />
                )
                : null}
            </li>
          )
        })}
      </ol>
    </article>
  )
}
