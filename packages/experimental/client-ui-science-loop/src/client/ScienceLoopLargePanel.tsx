/**
 * Large right-Sidebar view of the science-agent loop. Shows one round at a
 * time with a round switcher and the full stage/member detail that the inline
 * card keeps collapsed.
 */

import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGES, type LoopRound, type StageId } from '../shared/types.ts'
import { ScienceLoopEmpty, StageDetails, StageSummaryLines, formatDuration, statusLabel } from './parts.tsx'
import { stageSummary } from './summary.ts'

/** Sidebar-tab actions injected from the plugin's own client services. */
export interface ScienceLoopLargeInjected {
  /** Open one member's child Session of `parentSessionId` in the workspace. */
  readonly openChild: (parentSessionId: SessionId, childId: string) => void
  /** Open a workspace-relative file for the mounted Session. */
  readonly openFile: (sessionId: SessionId, path: string) => void
}

/** Composed props of the right-Sidebar loop tab. */
export type ScienceLoopLargePanelProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'scienceLoop'>
  & ScienceLoopLargeInjected

/** Title chip of the right-Sidebar loop tab. */
export function ScienceLoopTabTitle({ t }: PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'scienceLoop'>): React.JSX.Element {
  return <>{t('title')}</>
}

/** Render the selected round as a full vertical loop diagram. */
export function ScienceLoopLargePanel(props: ScienceLoopLargePanelProps): React.JSX.Element {
  const { useProjection, sessionId, openChild, openFile, t } = props
  const view = useProjection('scienceAgentLoop')
  const [pickedRoundId, setPickedRoundId] = useState<string | undefined>(undefined)
  const [openStage, setOpenStage] = useState<StageId | null>(null)
  const rounds = view?.rounds ?? []
  if (rounds.length === 0) {
    return (
      <ScienceLoopEmpty
        agentPreset={view?.agentPreset}
        scienceSkillLoaded={view?.scienceSkillLoaded}
        compact
        t={t}
      />
    )
  }

  const round = rounds.find(candidate => candidate.id === pickedRoundId)
    ?? rounds.find(candidate => candidate.id === view?.activeRoundId)
    ?? rounds[rounds.length - 1]
  if (round === undefined) return <div className="sal-large-empty">{t('empty')}</div>

  const now = Date.now()
  const activeMembers = STAGES.reduce(
    (count, id) => count + round.stages[id].members.filter(member => member.status === 'running').length,
    0,
  )
  const openSessionFor = (childId: string): void => { openChild(sessionId, childId) }

  return (
    <section className="sal-large" data-status={round.status}>
      <header className="sal-large-header">
        <span className="sal-dot" data-status={round.status} aria-hidden="true" />
        <span className="sal-title">{t('title')}</span>
        {round.roundId === undefined ? null : <code className="sal-round-id">{round.roundId}</code>}
        {round.mode === undefined ? null : <span className="sal-mode">{round.mode}</span>}
        <span className="sal-status">{statusLabel(t, round.status)}</span>
        {activeMembers === 0
          ? null
          : <span className="sal-running">{t('header.running', { count: String(activeMembers) })}</span>}
        <span className="sal-elapsed">
          {t('header.elapsed', { time: formatDuration((round.endedAt ?? now) - (round.startedAt ?? now)) })}
        </span>
      </header>

      <nav className="sal-rounds" aria-label={t('rounds.label')}>
        {rounds.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            className="sal-round-chip"
            aria-pressed={candidate.id === round.id}
            data-status={candidate.status}
            onClick={() => { setPickedRoundId(candidate.id); setOpenStage(null) }}
          >
            <span className="sal-dot" data-status={candidate.status} aria-hidden="true" />
            {candidate.roundId ?? `R${index + 1}`}
          </button>
        ))}
      </nav>

      <ol className="sal-large-stages">
        {STAGES.map((id, index) => {
          const stage = round.stages[id]
          const expanded = openStage === id
          return (
            <li
              key={id}
              className="sal-large-stage"
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
                <span className="sal-stage-role">{stageRole(stage, t)}</span>
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
                    openFile={(path) => { openFile(sessionId, path) }}
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
    </section>
  )
}

function stageRole(stage: LoopRound['stages'][StageId], t: ScienceLoopLargePanelProps['t']): string {
  if (stage.members.length === 0) return ''
  const roles = [...new Set(stage.members.map(member => member.role))]
  return roles.length === 1 ? (roles[0] ?? '') : t('stage.mixedRoles', { count: String(roles.length) })
}
