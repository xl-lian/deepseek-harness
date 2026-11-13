/**
 * Full-width Loop view tab: every round of the Session, oldest first, and in
 * each round one ring per experiment (hypothesis) showing the seven-stage
 * loop. Clicking a ring node shows that stage's content for the experiment
 * beside the ring. Content comes from the host `scienceAgentLoop` projection.
 */

import { useEffect, useRef, useState } from 'react'
import type { ConversationViewDefinition, ConversationViewNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGES, type LoopRound, type StageId } from '../shared/types.ts'
import { ExperimentRing } from './ExperimentRing.tsx'
import { roundExperiments, type LoopExperiment } from './experiments.ts'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RetainChild } from './MemberChild.tsx'
import type { ScienceLoopLargeInjected } from './ScienceLoopLargePanel.tsx'
import { ScienceLoopEmpty, StageDetails, formatDuration, statusLabel, type LoopTranslate } from './parts.tsx'
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

/** Loop-view actions injected from the plugin's own client services. */
export interface ScienceLoopViewInjected extends ScienceLoopLargeInjected {
  /** Retain one member's child Session of `parentSessionId` until `signal` aborts; the caller releases the reference. */
  readonly retainChild: (parentSessionId: SessionId, childId: string, signal: AbortSignal) => SessionReference
}

/** Composed props of the Loop view tab. */
export type ScienceLoopViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsLocale<'scienceLoop'>
  & ScienceLoopViewInjected

function roundLabel(round: LoopRound, index: number): string {
  return round.roundId ?? `R${index + 1}`
}

/** Stage shown before the user picks one: the live stage, else the verdict, else the latest activity. */
function defaultStage(experiment: LoopExperiment): StageId | null {
  if (experiment.status !== 'running' && experiment.round.stages.verifier.members.length > 0) return 'verifier'
  return currentStage(experiment.round) ?? null
}

/** Render every round as stacked experiment rings. */
export function ScienceLoopView(props: ScienceLoopViewProps): React.JSX.Element {
  const { useProjection, sessionId, openChild, openFile, t } = props
  const view = useProjection('scienceAgentLoop')
  const sections = useRef(new Map<string, HTMLElement>())
  const scrolled = useRef(false)
  const rounds = view?.rounds ?? []
  const activeRoundId = view?.activeRoundId ?? rounds[rounds.length - 1]?.id

  // Bring the active round into view once, when its section first mounts.
  useEffect(() => {
    if (scrolled.current || activeRoundId === undefined) return
    const element = sections.current.get(activeRoundId)
    if (element === undefined) return
    scrolled.current = true
    if (rounds.length > 1) element.scrollIntoView({ block: 'start' })
  })

  if (rounds.length === 0) {
    return (
      <ScienceLoopEmpty
        agentPreset={view?.agentPreset}
        scienceSkillLoaded={view?.scienceSkillLoaded}
        t={t}
      />
    )
  }

  const now = Date.now()
  const openSessionFor = (childId: string): void => { openChild(sessionId, childId) }
  const openSessionFile = (path: string): void => { openFile(sessionId, path) }
  const retainChild: RetainChild = (childId, signal) => props.retainChild(sessionId, childId, signal)

  return (
    <section className="sal-view">
      <header className="sal-view-header">
        <span className="sal-view-title">{t('title')}</span>
        <nav className="sal-rounds" aria-label={t('rounds.label')}>
          {rounds.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className="sal-round-chip"
              aria-current={candidate.id === activeRoundId ? 'true' : undefined}
              data-status={candidate.status}
              onClick={() => { sections.current.get(candidate.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}
            >
              <span className="sal-dot" data-status={candidate.status} aria-hidden="true" />
              {roundLabel(candidate, index)}
            </button>
          ))}
        </nav>
      </header>

      {rounds.map((round, index) => {
        const experiments = roundExperiments(round)
        const label = roundLabel(round, index)
        const activeMembers = STAGES.reduce(
          (count, id) => count + round.stages[id].members.filter(member => member.status === 'running').length,
          0,
        )
        const error = round.workflow?.error
        return (
          <section
            key={round.id}
            className="sal-round"
            data-status={round.status}
            aria-label={label}
            ref={(element) => {
              if (element === null) sections.current.delete(round.id)
              else sections.current.set(round.id, element)
            }}
          >
            <header className="sal-round-header">
              <span className="sal-dot" data-status={round.status} aria-hidden="true" />
              <h2 className="sal-round-title">{label}</h2>
              {round.mode === undefined ? null : <span className="sal-mode">{round.mode}</span>}
              <span className="sal-status">{statusLabel(t, round.status)}</span>
              {experiments.length > 1 || experiments[0]?.hypothesisId !== undefined
                ? <span className="sal-status">{t('round.experiments', { count: String(experiments.length) })}</span>
                : null}
              {activeMembers === 0 ? null : <span className="sal-running">{t('header.running', { count: String(activeMembers) })}</span>}
              <span className="sal-elapsed">
                {t('header.elapsed', { time: formatDuration((round.endedAt ?? now) - (round.startedAt ?? now)) })}
              </span>
            </header>
            {error === undefined ? null : <p className="sal-error">{error}</p>}
            {experiments.map(experiment => (
              <ExperimentBlock
                key={experiment.key}
                experiment={experiment}
                centerLabel={experiment.hypothesisId ?? label}
                sharedRound={experiments.length > 1}
                hasNextRound={index < rounds.length - 1}
                openFile={openSessionFile}
                openSessionFor={openSessionFor}
                retainChild={retainChild}
                t={t}
              />
            ))}
          </section>
        )
      })}
    </section>
  )
}

function ExperimentBlock({ experiment, centerLabel, sharedRound, hasNextRound, openFile, openSessionFor, retainChild, t }: {
  readonly experiment: LoopExperiment
  readonly centerLabel: string
  readonly sharedRound: boolean
  readonly hasNextRound: boolean
  readonly openFile: (path: string) => void
  readonly openSessionFor: (childId: string) => void
  readonly retainChild: RetainChild
  readonly t: LoopTranslate
}): React.JSX.Element {
  // undefined follows the live default; null means the user closed the detail.
  const [picked, setPicked] = useState<StageId | null | undefined>(undefined)
  const selected = picked === undefined ? defaultStage(experiment) : picked
  const stage = selected === null ? undefined : experiment.round.stages[selected]
  const shared = sharedRound && (selected === 'scout' || selected === 'statistician' || selected === 'report')
  return (
    <article className="sal-exp" data-status={experiment.status}>
      {experiment.hypothesisId === undefined ? null : (
        <h3 className="sal-exp-title">
          <code>{experiment.hypothesisId}</code>
          {experiment.hypothesis === undefined ? null : <span className="sal-exp-statement">{experiment.hypothesis.statement}</span>}
        </h3>
      )}
      <div className="sal-exp-body">
        <ExperimentRing
          experiment={experiment}
          centerLabel={centerLabel}
          sharedRound={sharedRound}
          hasNextRound={hasNextRound}
          selected={selected}
          onSelect={(id) => { setPicked(selected === id ? null : id) }}
          t={t}
        />
        <div className="sal-exp-detail">
          {stage === undefined
            ? <p className="sal-view-hint">{t('view.hint')}</p>
            : (
              <>
                <h4 className="sal-view-details-title">
                  {experiment.hypothesisId === undefined
                    ? t(`stage.${stage.id}`)
                    : `${t(`stage.${stage.id}`)} · ${experiment.hypothesisId}`}
                </h4>
                {shared ? <p className="sal-muted sal-shared-note">{t('ring.shared')}</p> : null}
                <StageDetails
                  stage={stage}
                  round={experiment.round}
                  openFile={openFile}
                  openSessionFor={openSessionFor}
                  t={t}
                  summaryLines={stageSummary(experiment.round, stage.id, t)}
                  experiment={experiment}
                  retainChild={retainChild}
                />
              </>
            )}
        </div>
      </div>
    </article>
  )
}
