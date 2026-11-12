/**
 * Full-width Loop view tab: the seven-stage science-agent architecture as a
 * left-to-right flow with its agents/subagents, live status, and a repair
 * back-edge. Content comes from the host `scienceAgentLoop` projection.
 */

import { Fragment, useState } from 'react'
import type { ConversationViewDefinition, ConversationViewNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGES, STAGE_ROLE, type LoopMember, type LoopRound, type LoopStage, type StageId } from '../shared/types.ts'
import type { ScienceLoopLargeInjected } from './ScienceLoopLargePanel.tsx'
import { ScienceLoopEmpty, StageDetails, StageSummaryLines, formatDuration, statusLabel } from './parts.tsx'
import { currentStage, stageSummary } from './summary.ts'

/** Empty snapshot for the target; the View reads the projection directly. */
export const EMPTY_LOOP_SNAPSHOT = { v: 1 } as const

/** Target registration so the shell can select the Loop tab. */
export const scienceLoopViewDefinition: ConversationViewDefinition<ConversationViewNode, { readonly v: 1 }> = {
  target: 'science-loop',
  create: () => ({
    empty: EMPTY_LOOP_SNAPSHOT,
    replace: () => EMPTY_LOOP_SNAPSHOT,
    apply: () => EMPTY_LOOP_SNAPSHOT,
  }),
}

/** Composed props of the Loop view tab. */
export type ScienceLoopViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsLocale<'scienceLoop'>
  & ScienceLoopLargeInjected

function latestRound(rounds: readonly LoopRound[], activeRoundId: string | undefined): LoopRound | undefined {
  return rounds.find(round => round.id === activeRoundId) ?? rounds[rounds.length - 1]
}

function uniqueness(members: readonly LoopMember[]): string {
  const roles = [...new Set(members.map(member => member.role))]
  if (roles.length === 0) return ''
  if (roles.length === 1) return members.length > 1 ? `${roles[0]} ×${members.length}` : (roles[0] ?? '')
  return roles.join(' · ')
}

function hasRepair(round: LoopRound): boolean {
  return round.stages.verifier.members.some(member => member.label.startsWith('repair-'))
    || round.stages.engineer.members.some(member => member.label.startsWith('repair-'))
}

function edgeState(source: LoopStage, target: LoopStage): 'idle' | 'done' | 'flowing' {
  if (source.status === 'completed' && target.status !== 'pending') return 'done'
  if (source.status === 'running' || (source.status === 'completed' && target.status === 'running')) return 'flowing'
  return 'idle'
}

/** Render the live architecture flow. */
export function ScienceLoopView(props: ScienceLoopViewProps): React.JSX.Element {
  const { useProjection, sessionId, openSession, openFile, t } = props
  const view = useProjection('scienceAgentLoop')
  const [pickedRoundId, setPickedRoundId] = useState<string | undefined>(undefined)
  const [override, setOverride] = useState<{ readonly roundId: string; readonly stage: StageId | null } | undefined>(undefined)
  const rounds = view?.rounds ?? []
  if (rounds.length === 0) {
    return (
      <ScienceLoopEmpty
        agentPreset={view?.agentPreset}
        scienceSkillLoaded={view?.scienceSkillLoaded}
        t={t}
      />
    )
  }

  const round = rounds.find(candidate => candidate.id === pickedRoundId)
    ?? latestRound(rounds, view?.activeRoundId)
  if (round === undefined) return <div className="sal-view-empty">{t('empty')}</div>

  const autoStage = currentStage(round)
  const selectedStage = override !== undefined && override.roundId === round.id ? override.stage : autoStage
  const selected = selectedStage === null || selectedStage === undefined ? undefined : round.stages[selectedStage]
  const now = Date.now()
  const activeMembers = STAGES.reduce(
    (count, id) => count + round.stages[id].members.filter(member => member.status === 'running').length,
    0,
  )
  const openSessionFor = (childId: string): void => {
    openSession({ parentSessionId: sessionId, childSessionId: childId as SessionId, mode: 'one-shot' })
  }
  const error = round.workflow?.error

  return (
    <section className="sal-view">
      <header className="sal-view-header">
        <span className="sal-dot" data-status={round.status} aria-hidden="true" />
        <span className="sal-view-title">{t('title')}</span>
        {round.roundId === undefined ? null : <code className="sal-round-id">{round.roundId}</code>}
        {round.mode === undefined ? null : <span className="sal-mode">{round.mode}</span>}
        <span className="sal-status">{statusLabel(t, round.status)}</span>
        {activeMembers === 0 ? null : <span className="sal-running">{t('header.running', { count: String(activeMembers) })}</span>}
        <span className="sal-elapsed">
          {t('header.elapsed', { time: formatDuration((round.endedAt ?? now) - (round.startedAt ?? now)) })}
        </span>
        <nav className="sal-rounds" aria-label={t('rounds.label')}>
          {rounds.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className="sal-round-chip"
              aria-pressed={candidate.id === round.id}
              data-status={candidate.status}
              onClick={() => { setPickedRoundId(candidate.id); setOverride(undefined) }}
            >
              <span className="sal-dot" data-status={candidate.status} aria-hidden="true" />
              {candidate.roundId ?? `R${index + 1}`}
            </button>
          ))}
        </nav>
      </header>

      {error === undefined ? null : <p className="sal-error">{error}</p>}

      <div className="sal-flow" data-status={round.status}>
        {STAGES.map((id, index) => {
          const stage = round.stages[id]
          const previous = index === 0 ? undefined : round.stages[STAGES[index - 1] as StageId]
          return (
            <Fragment key={id}>
              {previous === undefined ? null : (
                <span
                  className="sal-flow-edge"
                  data-flow={edgeState(previous, stage)}
                  aria-hidden="true"
                />
              )}
              <StageNode
                stage={stage}
                round={round}
                selected={selectedStage === id}
                onSelect={() => { setOverride({ roundId: round.id, stage: selectedStage === id ? null : id }) }}
                t={t}
              />
            </Fragment>
          )
        })}
      </div>
      {hasRepair(round) ? (
        <div className="sal-repair-row">
          <span className="sal-repair-line" aria-hidden="true" />
          <span>{t('flow.repair')}</span>
        </div>
      ) : null}

      {selected === undefined
        ? <p className="sal-view-hint">{t('view.hint')}</p>
        : (
          <div className="sal-view-details">
            <h3 className="sal-view-details-title">{t(`stage.${selected.id}`)}</h3>
            <StageDetails
              stage={selected}
              round={round}
              openFile={(path) => { openFile(sessionId, path) }}
              openSessionFor={openSessionFor}
              t={t}
              summaryLines={stageSummary(round, selected.id, t)}
            />
          </div>
        )}
    </section>
  )
}

function StageNode({ stage, round, selected, onSelect, t }: {
  readonly stage: LoopStage
  readonly round: LoopRound
  readonly selected: boolean
  readonly onSelect: () => void
  readonly t: ScienceLoopViewProps['t']
}): React.JSX.Element {
  const members = stage.members.slice(-4)
  const summary = stageSummary(round, stage.id, t).slice(0, 2)
  const role = uniqueness(stage.members) || STAGE_ROLE[stage.id]
  return (
    <button
      type="button"
      className="sal-node"
      data-status={stage.status}
      aria-current={stage.status === 'running' ? 'step' : undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="sal-node-head">
        <span className="sal-dot" data-status={stage.status} aria-hidden="true" />
        <span className="sal-node-name">{t(`stage.${stage.id}`)}</span>
        {stage.verdict === undefined
          ? null
          : <span className="sal-verdict" data-verdict={stage.verdict}>{stage.verdict}</span>}
      </span>
      <span className="sal-node-role" title={role}>{role}</span>
      <span className={stage.status === 'completed' ? 'sal-sr' : 'sal-node-status'}>
        {t(`status.${stage.status}`)}
      </span>
      <StageSummaryLines lines={summary} className="sal-node-summary" />
      {members.length === 0 ? null : (
        <span className="sal-node-members">
          {members.map(member => (
            <span key={member.id} className="sal-node-member" data-status={member.status}>
              <span className="sal-dot" data-status={member.status} aria-hidden="true" />
              {member.label}
            </span>
          ))}
          {stage.members.length > members.length
            ? <span className="sal-node-more">{`+${stage.members.length - members.length}`}</span>
            : null}
        </span>
      )}
    </button>
  )
}
