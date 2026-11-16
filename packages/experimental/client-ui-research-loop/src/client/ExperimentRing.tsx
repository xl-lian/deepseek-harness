/**
 * One experiment drawn as a ring of the seven loop stages, Scout at 12 o'clock
 * and clockwise through Report, with the closing Report → Scout arc and, after
 * a repair, a Verifier → Engineer chord through the ring interior.
 */

import { STAGES, type LoopStage, type StageId } from '../shared/campaign-types.ts'
import { latestAttempts } from '../shared/stage.ts'
import type { LoopExperiment, LoopExperimentOutcome } from './experiments.ts'
import type { ResearchTranslate } from './parts.tsx'
import { arcConnector, chordConnector, cyclicPairs, RING_SIZE, ringPercent, ringSlots, type RingSlot } from './ring.ts'
import { stageSummary } from './summary.ts'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const
const SLOTS = ringSlots(STAGES)
const ARCS = cyclicPairs(SLOTS)

function slotOf(id: StageId): RingSlot<StageId> | undefined {
  return SLOTS.find(slot => slot.item === id)
}
/** Stages whose content is the same in every experiment of a round. */
const SHARED_STAGES: ReadonlySet<StageId> = new Set(['scout', 'statistician', 'report'])

type Flow = 'idle' | 'done' | 'flowing'

function edgeState(source: LoopStage, target: LoopStage): Flow {
  if (source.status === 'completed' && target.status !== 'pending') return 'done'
  if (source.status === 'running' || (source.status === 'completed' && target.status === 'running')) return 'flowing'
  return 'idle'
}

/**
 * Short label of a decision outcome.
 * @param t - loop translator.
 * @param outcome - experiment outcome.
 * @returns one or two words for the ring center and the Decide node.
 */
export function outcomeTag(t: ResearchTranslate, outcome: LoopExperimentOutcome): string {
  switch (outcome.kind) {
    case 'chosen': return t('campaign.outcome.chosen.short')
    case 'eliminated': return t('campaign.outcome.eliminated.short')
    case 'candidate': return outcome.candidate.rank === undefined
      ? t('campaign.outcome.candidate.short')
      : t('campaign.outcome.rank.short', { rank: String(outcome.candidate.rank) })
  }
}

function checkTally(stage: LoopStage, t: ResearchTranslate): string | undefined {
  const checks = latestAttempts(stage).flatMap(member => member.checks ?? [])
  if (checks.length === 0) return undefined
  const count = (status: string): string => String(checks.filter(check => check.status === status).length)
  return t('campaign.ring.checks', { fail: count('fail'), warn: count('warn'), pass: count('pass') })
}

function nodeLine(experiment: LoopExperiment, id: StageId, t: ResearchTranslate): string | undefined {
  const round = experiment.round
  if (id === 'hypotheses' && experiment.hypothesis !== undefined) return experiment.hypothesis.statement
  if (id === 'verifier') {
    const tally = checkTally(round.stages.verifier, t)
    if (tally !== undefined) return tally
  }
  if (id === 'decide' && experiment.outcome !== undefined) {
    const tag = outcomeTag(t, experiment.outcome)
    return experiment.outcome.kind === 'eliminated' ? `${tag}: ${experiment.outcome.reason}` : tag
  }
  return stageSummary(round, id, t)[0]
}

/** Props of {@link ExperimentRing}. */
export interface ExperimentRingProps {
  readonly experiment: LoopExperiment
  /** Text in the ring center: the hypothesis id, or the round label for a round-level ring. */
  readonly centerLabel: string
  /** Whether other experiments share this round, which marks Scout, Statistician, and Report as shared. */
  readonly sharedRound: boolean
  /** Whether a later round follows, which marks the closing Report → Scout arc as traversed. */
  readonly hasNextRound: boolean
  readonly selected: StageId | null
  readonly onSelect: (id: StageId) => void
  readonly t: ResearchTranslate
}

/**
 * Render one experiment ring with clickable stage nodes.
 * @param props - ring props.
 * @returns the ring element.
 */
export function ExperimentRing(props: ExperimentRingProps): React.JSX.Element {
  const { experiment, centerLabel, sharedRound, hasNextRound, selected, onSelect, t } = props
  const stages = experiment.round.stages
  const verifierSlot = slotOf('verifier')
  const engineerSlot = slotOf('engineer')
  const repair = experiment.repaired && verifierSlot !== undefined && engineerSlot !== undefined
    ? chordConnector(verifierSlot.point, engineerSlot.point)
    : undefined
  return (
    <div className="rlc-ring" data-status={experiment.status}>
      <svg className="rlc-ring-edges" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true" focusable="false">
        {ARCS.map(([from, to]) => {
          const connector = arcConnector(from.point, to.point)
          if (connector === undefined) return null
          const closing = to.item === 'scout'
          const flow: Flow = closing
            ? (hasNextRound ? 'done' : 'idle')
            : edgeState(stages[from.item], stages[to.item])
          return (
            <g key={from.item} className="rlc-ring-arc" data-flow={flow} data-closing={closing ? 'true' : undefined}>
              <path className="rlc-ring-line" d={connector.line} />
              <path className="rlc-ring-arrow" d={connector.arrow} />
            </g>
          )
        })}
        {repair === undefined ? null : (
          <g className="rlc-ring-repair">
            <path className="rlc-ring-line" d={repair.line} />
            <path className="rlc-ring-arrow" d={repair.arrow} />
            <text x={repair.label.x} y={repair.label.y} textAnchor="middle" dy="-4">{t('campaign.ring.repair')}</text>
          </g>
        )}
      </svg>

      <div className="rlc-ring-center">
        <code className="rlc-ring-key">{centerLabel}</code>
        <span className="rlc-ring-center-status">
          <span className="rl-dot" data-status={experiment.status} aria-hidden="true" />
          {t(`status.${experiment.status}`)}
        </span>
        <span className="rlc-ring-center-tags">
          {experiment.verdict === undefined
            ? null
            : <span className="rlc-verdict" data-verdict={experiment.verdict}>{experiment.verdict}</span>}
          {experiment.outcome === undefined
            ? null
            : <span className="rlc-tag" data-outcome={experiment.outcome.kind}>{outcomeTag(t, experiment.outcome)}</span>}
        </span>
      </div>

      <ol className="rlc-ring-nodes" aria-label={t('campaign.ring.label', { key: centerLabel })}>
        {SLOTS.map(({ item: id, point }, index) => {
          const stage = stages[id]
          const shared = sharedRound && SHARED_STAGES.has(id)
          const line = nodeLine(experiment, id, t)
          return (
            <li key={id} className="rlc-ring-slot" style={ringPercent(point)}>
              <button
                type="button"
                className="rlc-ring-node"
                data-stage={id}
                data-status={stage.status}
                data-shared={shared ? 'true' : undefined}
                aria-current={stage.status === 'running' ? 'step' : undefined}
                aria-pressed={selected === id}
                title={shared ? t('campaign.ring.shared') : undefined}
                onClick={() => { onSelect(id) }}
              >
                <span className="rlc-ring-node-head">
                  <span className="rlc-ring-numeral" aria-hidden="true">{ROMAN[index]}</span>
                  <span className="rl-dot" data-status={stage.status} aria-hidden="true" />
                  <span className="rlc-ring-node-name">{t(`campaign.stage.${id}`)}</span>
                  {stage.verdict === undefined
                    ? null
                    : <span className="rlc-verdict" data-verdict={stage.verdict}>{stage.verdict}</span>}
                </span>
                <span className="rlc-sr">{t(`status.${stage.status}`)}</span>
                {line === undefined || line.trim() === '' ? null : <span className="rlc-ring-node-line">{line}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
