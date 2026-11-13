/**
 * One experiment drawn as a ring of the seven loop stages, Scout at 12 o'clock
 * and clockwise through Report, with the closing Report → Scout arc and, after
 * a repair, a Verifier → Engineer chord through the ring interior.
 */

import { STAGES, type LoopStage, type StageId } from '../shared/types.ts'
import { latestAttempts } from '../shared/stage.ts'
import type { LoopExperiment, LoopExperimentOutcome } from './experiments.ts'
import type { LoopTranslate } from './parts.tsx'
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
export function outcomeTag(t: LoopTranslate, outcome: LoopExperimentOutcome): string {
  switch (outcome.kind) {
    case 'chosen': return t('outcome.chosen.short')
    case 'eliminated': return t('outcome.eliminated.short')
    case 'candidate': return outcome.candidate.rank === undefined
      ? t('outcome.candidate.short')
      : t('outcome.rank.short', { rank: String(outcome.candidate.rank) })
  }
}

function checkTally(stage: LoopStage, t: LoopTranslate): string | undefined {
  const checks = latestAttempts(stage).flatMap(member => member.checks ?? [])
  if (checks.length === 0) return undefined
  const count = (status: string): string => String(checks.filter(check => check.status === status).length)
  return t('ring.checks', { fail: count('fail'), warn: count('warn'), pass: count('pass') })
}

function nodeLine(experiment: LoopExperiment, id: StageId, t: LoopTranslate): string | undefined {
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
  readonly t: LoopTranslate
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
    <div className="sal-ring" data-status={experiment.status}>
      <svg className="sal-ring-edges" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true" focusable="false">
        {ARCS.map(([from, to]) => {
          const connector = arcConnector(from.point, to.point)
          if (connector === undefined) return null
          const closing = to.item === 'scout'
          const flow: Flow = closing
            ? (hasNextRound ? 'done' : 'idle')
            : edgeState(stages[from.item], stages[to.item])
          return (
            <g key={from.item} className="sal-ring-arc" data-flow={flow} data-closing={closing ? 'true' : undefined}>
              <path className="sal-ring-line" d={connector.line} />
              <path className="sal-ring-arrow" d={connector.arrow} />
            </g>
          )
        })}
        {repair === undefined ? null : (
          <g className="sal-ring-repair">
            <path className="sal-ring-line" d={repair.line} />
            <path className="sal-ring-arrow" d={repair.arrow} />
            <text x={repair.label.x} y={repair.label.y} textAnchor="middle" dy="-4">{t('ring.repair')}</text>
          </g>
        )}
      </svg>

      <div className="sal-ring-center">
        <code className="sal-ring-key">{centerLabel}</code>
        <span className="sal-ring-center-status">
          <span className="sal-dot" data-status={experiment.status} aria-hidden="true" />
          {t(`status.${experiment.status}`)}
        </span>
        <span className="sal-ring-center-tags">
          {experiment.verdict === undefined
            ? null
            : <span className="sal-verdict" data-verdict={experiment.verdict}>{experiment.verdict}</span>}
          {experiment.outcome === undefined
            ? null
            : <span className="sal-tag" data-outcome={experiment.outcome.kind}>{outcomeTag(t, experiment.outcome)}</span>}
        </span>
      </div>

      <ol className="sal-ring-nodes" aria-label={t('ring.label', { key: centerLabel })}>
        {SLOTS.map(({ item: id, point }, index) => {
          const stage = stages[id]
          const shared = sharedRound && SHARED_STAGES.has(id)
          const line = nodeLine(experiment, id, t)
          return (
            <li key={id} className="sal-ring-slot" style={ringPercent(point)}>
              <button
                type="button"
                className="sal-ring-node"
                data-stage={id}
                data-status={stage.status}
                data-shared={shared ? 'true' : undefined}
                aria-current={stage.status === 'running' ? 'step' : undefined}
                aria-pressed={selected === id}
                title={shared ? t('ring.shared') : undefined}
                onClick={() => { onSelect(id) }}
              >
                <span className="sal-ring-node-head">
                  <span className="sal-ring-numeral" aria-hidden="true">{ROMAN[index]}</span>
                  <span className="sal-dot" data-status={stage.status} aria-hidden="true" />
                  <span className="sal-ring-node-name">{t(`stage.${id}`)}</span>
                  {stage.verdict === undefined
                    ? null
                    : <span className="sal-verdict" data-verdict={stage.verdict}>{stage.verdict}</span>}
                </span>
                <span className="sal-sr">{t(`status.${stage.status}`)}</span>
                {line === undefined || line.trim() === '' ? null : <span className="sal-ring-node-line">{line}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
