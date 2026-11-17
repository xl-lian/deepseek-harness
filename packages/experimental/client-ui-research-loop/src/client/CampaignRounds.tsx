/**
 * One campaign round in the notebook timeline: the shared round header and
 * stage rail, then one ring per experiment (hypothesis) showing the seven-stage
 * loop. Clicking a ring node shows that stage's content for the experiment
 * beside the ring.
 */

import { useState } from 'react'
import { STAGES, type LoopRound, type StageId } from '../shared/campaign-types.ts'
import { ExperimentRing } from './ExperimentRing.tsx'
import { roundExperiments, type LoopExperiment } from './experiments.ts'
import { StageDetails } from './campaign-parts.tsx'
import type { RetainChild } from './MemberChild.tsx'
import { elapsed, formatDuration } from './model.ts'
import { Rail, StatusMark, type ResearchTranslate } from './parts.tsx'
import { currentStage, stageSummary } from './summary.ts'

/** Navigation a campaign round needs, already bound to its Session. */
export interface CampaignNavigation {
  /** Open one member's child Session. */
  readonly openSessionFor: (childId: string) => void
  /** Open a workspace-relative file in the right Sidebar. */
  readonly openFile: (path: string) => void
  /** Retain one member's child Session until `signal` aborts. */
  readonly retainChild: RetainChild
}

/**
 * Round label: the `sagent` round id once known, else its position.
 * @param round - the round.
 * @param index - zero-based position among campaign rounds.
 * @param t - translator.
 * @returns the label.
 */
/**
 * Tags for a round's search strategy and ensemble: an explore round after a plateau, and the blend it built or skipped.
 * @param round - the campaign round.
 * @param t - locale translator.
 * @param className - tag class of the surface.
 * @returns the tags, possibly none.
 */
export function RoundTags({ round, t, className }: { round: LoopRound; t: ResearchTranslate; className: string }) {
  const ensemble = round.ensemble
  return (
    <>
      {round.strategy === 'explore'
        ? <span className={className} data-tag="explore" title={round.strategyReason}>{t('campaign.round.explore')}</span>
        : null}
      {ensemble === undefined
        ? null
        : ensemble.built
          ? (
            <span className={className} data-tag="ensemble" title={ensemble.scores === undefined ? undefined : ensemble.scores.join(', ')}>
              {t('campaign.round.ensemble', { count: String(ensemble.members ?? 0) })}
            </span>
          )
          : <span className={className} data-tag="no-ensemble" title={ensemble.reason}>{t('campaign.round.noEnsemble')}</span>}
    </>
  )
}

export function campaignRoundLabel(round: LoopRound, index: number, t: ResearchTranslate): string {
  return round.roundId ?? t('campaign.round.position', { number: index + 1 })
}

/** Stage shown before the user picks one: the live stage, else the verdict, else the latest activity. */
function defaultStage(experiment: LoopExperiment): StageId | null {
  if (experiment.status !== 'running' && experiment.round.stages.verifier.members.length > 0) return 'verifier'
  return currentStage(experiment.round) ?? null
}

/** Props of {@link CampaignRoundSection}. */
export interface CampaignRoundSectionProps extends CampaignNavigation {
  readonly round: LoopRound
  /** Zero-based position among campaign rounds. */
  readonly index: number
  /** Whether a later campaign round exists, which the ring draws as an outgoing arc. */
  readonly hasNextRound: boolean
  readonly t: ResearchTranslate
}

/** Render one campaign round in the notebook frame. */
export function CampaignRoundSection({
  round, index, hasNextRound, openSessionFor, openFile, retainChild, t,
}: CampaignRoundSectionProps): React.JSX.Element {
  const experiments = roundExperiments(round)
  const label = campaignRoundLabel(round, index, t)
  const activeMembers = STAGES.reduce(
    (count, id) => count + round.stages[id].members.filter(member => member.status === 'running').length,
    0,
  )
  const time = elapsed(round.startedAt, round.endedAt, Date.now())
  const error = round.workflow?.error
  const steps = STAGES.map(id => ({ key: id, label: t(`campaign.stage.${id}`), status: round.stages[id].status }))
  return (
    <section className="rl-run rl-campaign" data-status={round.status} aria-label={label}>
      <header className="rl-run-head">
        <StatusMark status={round.status} t={t} />
        <h3 className="rl-run-title">{t('campaign.title')}</h3>
        <code className="rl-round-id">{label}</code>
        {round.mode === undefined ? null : <span className="rl-tag">{round.mode}</span>}
        <RoundTags round={round} t={t} className="rl-tag" />
        <span className="rl-muted">{t(`status.${round.status}`)}</span>
        {experiments.length > 1 || experiments[0]?.hypothesisId !== undefined
          ? <span className="rl-muted">{t('campaign.round.experiments', { count: String(experiments.length) })}</span>
          : null}
        {activeMembers === 0 ? null : <span className="rl-phase">{t('campaign.header.running', { count: String(activeMembers) })}</span>}
        {time === undefined ? null : <span className="rl-elapsed">{t('run.elapsed', { time: formatDuration(time) })}</span>}
      </header>
      <Rail steps={steps} t={t} />
      {error === undefined ? null : <p className="rlc-error">{error}</p>}
      {experiments.map(experiment => (
        <ExperimentBlock
          key={experiment.key}
          experiment={experiment}
          centerLabel={experiment.hypothesisId ?? label}
          sharedRound={experiments.length > 1}
          hasNextRound={hasNextRound}
          openFile={openFile}
          openSessionFor={openSessionFor}
          retainChild={retainChild}
          t={t}
        />
      ))}
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
  readonly t: ResearchTranslate
}): React.JSX.Element {
  // undefined follows the live default; null means the user closed the detail.
  const [picked, setPicked] = useState<StageId | null | undefined>(undefined)
  const selected = picked === undefined ? defaultStage(experiment) : picked
  const stage = selected === null ? undefined : experiment.round.stages[selected]
  const shared = sharedRound && (selected === 'scout' || selected === 'statistician' || selected === 'report')
  return (
    <article className="rlc-exp" data-status={experiment.status}>
      {experiment.hypothesisId === undefined ? null : (
        <h3 className="rlc-exp-title">
          <code>{experiment.hypothesisId}</code>
          {experiment.hypothesis === undefined ? null : <span className="rlc-exp-statement">{experiment.hypothesis.statement}</span>}
        </h3>
      )}
      <div className="rlc-exp-body">
        <ExperimentRing
          experiment={experiment}
          centerLabel={centerLabel}
          sharedRound={sharedRound}
          hasNextRound={hasNextRound}
          selected={selected}
          onSelect={(id) => { setPicked(selected === id ? null : id) }}
          t={t}
        />
        <div className="rlc-exp-detail">
          {stage === undefined
            ? <p className="rlc-view-hint">{t('campaign.view.hint')}</p>
            : (
              <>
                <h4 className="rlc-view-details-title">
                  {experiment.hypothesisId === undefined
                    ? t(`campaign.stage.${stage.id}`)
                    : `${t(`campaign.stage.${stage.id}`)} · ${experiment.hypothesisId}`}
                </h4>
                {shared ? <p className="rlc-muted rlc-shared-note">{t('campaign.ring.shared')}</p> : null}
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
