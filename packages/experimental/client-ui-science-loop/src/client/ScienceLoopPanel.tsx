/**
 * Inline science-agent loop card: seven stages with live status, per-stage
 * member details, and links to the run artifacts and child sessions.
 */

import { useState } from 'react'
import type { SessionTarget } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGE_ROLE, STAGES, type LoopRound, type StageId } from '../shared/types.ts'
import type {} from './definition.ts'
import { StageDetails, StageSummaryLines, formatDuration, statusLabel } from './parts.tsx'
import { stageSummary } from './summary.ts'

/** Navigation actions injected from the plugin's own client services. */
export interface ScienceLoopInjected {
  readonly openSession: (target: SessionTarget) => void
  /** Open the large right-Sidebar view. */
  readonly openLarge: () => void
}

/** Complete keyed Chat renderer props for the loop card. */
export type ScienceLoopPanelProps =
  & PropsRuntime<'conversation.chat.node', 'science-loop'>
  & PropsLocale<'scienceLoop'>
  & ScienceLoopInjected

function findRound(rounds: readonly LoopRound[], anchorId: string): LoopRound | undefined {
  return rounds.find(round => round.anchor.id === anchorId)
}

/** Render one round's loop card with live stage highlighting. */
export function ScienceLoopPanel(props: ScienceLoopPanelProps): React.JSX.Element | null {
  const { node, useProjection, openFile, openSession, openLarge, sessionId, t } = props
  const view = useProjection('scienceAgentLoop')
  const [openStage, setOpenStage] = useState<StageId | null>(null)
  const round = view === undefined ? undefined : findRound(view.rounds, node.data.anchorId)
  if (round === undefined) return null

  const now = Date.now()
  const elapsed = (round.endedAt ?? now) - (round.startedAt ?? now)
  const activeMembers = STAGES.reduce(
    (count, id) => count + round.stages[id].members.filter(member => member.status === 'running').length,
    0,
  )
  const openSessionFor = (childId: string): void => {
    openSession({ parentSessionId: sessionId, childSessionId: childId as SessionId, mode: 'one-shot' })
  }

  return (
    <article className="sal-card" data-status={round.status}>
      <header className="sal-header">
        <span className="sal-dot" data-status={round.status} aria-hidden="true" />
        <span className="sal-title">{t('title')}</span>
        {round.roundId === undefined ? null : <code className="sal-round-id">{round.roundId}</code>}
        {round.mode === undefined ? null : <span className="sal-mode">{round.mode}</span>}
        <span className="sal-status">{statusLabel(t, round.status)}</span>
        {activeMembers === 0
          ? null
          : <span className="sal-running">{t('header.running', { count: String(activeMembers) })}</span>}
        <span className="sal-elapsed">{t('header.elapsed', { time: formatDuration(elapsed) })}</span>
        <button type="button" className="sal-expand" onClick={openLarge}>{t('header.expand')}</button>
      </header>

      <ol className="sal-stages">
        {STAGES.map((id, index) => {
          const stage = round.stages[id]
          const expanded = openStage === id
          return (
            <li
              key={id}
              className="sal-stage"
              data-stage={id}
              data-status={stage.status}
              aria-current={stage.status === 'running' ? 'step' : undefined}
            >
              {index === 0 ? null : <span className="sal-connector" aria-hidden="true" />}
              <button
                type="button"
                className="sal-stage-button"
                aria-expanded={expanded}
                onClick={() => { setOpenStage(expanded ? null : id) }}
              >
                <span className="sal-dot" data-status={stage.status} aria-hidden="true" />
                <span className="sal-stage-name">{t(`stage.${id}`)}</span>
                <span className="sal-stage-role">{STAGE_ROLE[id]}</span>
                {stage.members.length === 0
                  ? null
                  : <span className="sal-stage-count">{String(stage.members.length)}</span>}
                {stage.verdict === undefined
                  ? null
                  : <span className="sal-verdict" data-verdict={stage.verdict}>{stage.verdict}</span>}
                <StageSummaryLines lines={stageSummary(round, id, t).slice(0, 1)} className="sal-node-summary" />
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
