/**
 * Split one loop round into experiments for the Loop view rings. An experiment
 * is one registered hypothesis: its Engineer and Verifier members come from the
 * workflow labels (`engineer-<id>`, `verify-<id>`, `repair-<id>`, ...), and the
 * round's other stages are shared by every experiment of the round.
 */

import { deriveStage, experimentKeyOf, isSettled } from '../shared/stage.ts'
import {
  STAGES,
  type LoopCandidate,
  type LoopHypothesis,
  type LoopMember,
  type LoopRound,
  type LoopStage,
  type LoopStatus,
  type LoopVerdict,
  type StageId,
} from '../shared/types.ts'

/** Stages whose members are split per experiment. */
const SCOPED_STAGES = ['engineer', 'verifier'] as const satisfies readonly StageId[]

/** What `sagent decide` did with an experiment's runs. */
export type LoopExperimentOutcome =
  | { readonly kind: 'chosen'; readonly runId: string }
  | { readonly kind: 'eliminated'; readonly runId: string; readonly reason: string }
  | { readonly kind: 'candidate'; readonly candidate: LoopCandidate }

/** One ring of the Loop view. */
export interface LoopExperiment {
  /** Hypothesis id, or the round's projection id for a round-level ring. */
  readonly key: string
  /** Hypothesis id; `undefined` for a round-level ring. */
  readonly hypothesisId?: string | undefined
  readonly hypothesis?: LoopHypothesis | undefined
  /**
   * The round as this experiment sees it: Engineer and Verifier hold only this
   * experiment's members (plus members no experiment claims), and `hypotheses`
   * holds only this experiment's hypothesis when the round recorded it.
   */
  readonly round: LoopRound
  /** Run ids produced or verified by this experiment's members. */
  readonly runIds: readonly string[]
  /** Whether a repair or re-verification ran. */
  readonly repaired: boolean
  /** Verdict of the latest-started verification that has one. */
  readonly verdict?: LoopVerdict | undefined
  readonly outcome?: LoopExperimentOutcome | undefined
  readonly status: LoopStatus
}

function isRepair(member: LoopMember): boolean {
  return member.label.startsWith('repair-') || member.label.startsWith('reverify-')
}

function sharesRun(member: LoopMember, runIds: ReadonlySet<string>): boolean {
  return (member.runIds ?? []).some(runId => runIds.has(runId))
}

function finalVerdict(verifier: LoopStage): LoopVerdict | undefined {
  let latest: LoopMember | undefined
  for (const member of verifier.members) {
    if (member.verdict === undefined) continue
    if (latest === undefined || (member.startedAt ?? 0) >= (latest.startedAt ?? 0)) latest = member
  }
  return latest?.verdict
}

function outcomeOf(round: LoopRound, runIds: readonly string[]): LoopExperimentOutcome | undefined {
  const decision = round.decision
  if (decision === undefined || runIds.length === 0) return undefined
  const own = new Set(runIds)
  if (decision.chosenRunId !== undefined && own.has(decision.chosenRunId)) {
    return { kind: 'chosen', runId: decision.chosenRunId }
  }
  const eliminated = decision.eliminated.find(entry => own.has(entry.runId))
  if (eliminated !== undefined) return { kind: 'eliminated', runId: eliminated.runId, reason: eliminated.reason }
  const candidate = decision.candidates.find(entry => own.has(entry.runId))
  return candidate === undefined ? undefined : { kind: 'candidate', candidate }
}

function experimentStatus(round: LoopRound, stages: Readonly<Record<StageId, LoopStage>>): LoopStatus {
  const own = SCOPED_STAGES.flatMap(id => stages[id].members)
  if (own.length === 0) return isSettled(round.status) ? round.status : 'pending'
  if (own.some(member => member.status === 'running')) return 'running'
  if (SCOPED_STAGES.some(id => stages[id].status === 'failed')) return 'failed'
  return SCOPED_STAGES.every(id => isSettled(stages[id].status) || stages[id].members.length === 0) ? 'completed' : 'running'
}

function experimentKeys(round: LoopRound): string[] {
  const keys: string[] = []
  const add = (key: string | undefined): void => {
    if (key !== undefined && !keys.includes(key)) keys.push(key)
  }
  for (const hypothesis of round.hypotheses ?? []) add(hypothesis.hypothesisId)
  for (const id of SCOPED_STAGES) {
    for (const member of round.stages[id].members) add(experimentKeyOf(member.label))
  }
  return keys
}

function roundLevel(round: LoopRound): LoopExperiment {
  const members = SCOPED_STAGES.flatMap(id => round.stages[id].members)
  const runIds = [...new Set(members.flatMap(member => member.runIds ?? []))]
  return {
    key: round.id,
    round,
    runIds,
    repaired: members.some(isRepair),
    verdict: finalVerdict(round.stages.verifier),
    outcome: undefined,
    status: round.status,
  }
}

/**
 * Split a round into one experiment per hypothesis.
 *
 * Experiment order is the round's registered hypotheses, then hypothesis ids
 * first seen in Engineer and Verifier labels. A member without a hypothesis
 * label joins the experiments whose runs it shares, and every experiment when
 * it shares none. A round with no hypothesis id yet yields one round-level
 * experiment holding the whole round.
 * @param round - projected loop round.
 * @returns at least one experiment.
 */
export function roundExperiments(round: LoopRound): LoopExperiment[] {
  const keys = experimentKeys(round)
  if (keys.length === 0) return [roundLevel(round)]

  const keyed = new Map<string, Record<(typeof SCOPED_STAGES)[number], LoopMember[]>>(
    keys.map(key => [key, { engineer: [], verifier: [] }]),
  )
  const unkeyed: Record<(typeof SCOPED_STAGES)[number], LoopMember[]> = { engineer: [], verifier: [] }
  for (const id of SCOPED_STAGES) {
    for (const member of round.stages[id].members) {
      const key = experimentKeyOf(member.label)
      const bucket = key === undefined ? undefined : keyed.get(key)
      if (bucket === undefined) unkeyed[id].push(member)
      else bucket[id].push(member)
    }
  }
  const runsByKey = new Map(keys.map((key) => {
    const bucket = keyed.get(key)
    const members = bucket === undefined ? [] : [...bucket.engineer, ...bucket.verifier]
    return [key, new Set(members.flatMap(member => member.runIds ?? []))] as const
  }))
  const claimed = new Set<LoopMember>()
  for (const id of SCOPED_STAGES) {
    for (const member of unkeyed[id]) {
      if ([...runsByKey.values()].some(runIds => sharesRun(member, runIds))) claimed.add(member)
    }
  }

  return keys.map((key): LoopExperiment => {
    const bucket = keyed.get(key) ?? { engineer: [], verifier: [] }
    const runIds = runsByKey.get(key) ?? new Set<string>()
    const scoped = (id: (typeof SCOPED_STAGES)[number]): LoopStage => {
      // Keep the round's order: members are appended as they start.
      const members = round.stages[id].members.filter(member => bucket[id].includes(member)
        || (unkeyed[id].includes(member) && (claimed.has(member) ? sharesRun(member, runIds) : true)))
      return deriveStage({ id, status: 'pending', members })
    }
    const stages = Object.fromEntries(STAGES.map((id): [StageId, LoopStage] => [
      id,
      id === 'engineer' || id === 'verifier' ? scoped(id) : round.stages[id],
    ])) as Record<StageId, LoopStage>
    const hypothesis = round.hypotheses?.find(candidate => candidate.hypothesisId === key)
    const ownMembers = [...bucket.engineer, ...bucket.verifier]
    return {
      key,
      hypothesisId: key,
      hypothesis,
      round: {
        ...round,
        stages,
        ...(hypothesis === undefined ? {} : { hypotheses: [hypothesis] }),
      },
      runIds: [...runIds],
      repaired: ownMembers.some(isRepair),
      verdict: finalVerdict(stages.verifier),
      outcome: outcomeOf(round, [...runIds]),
      status: experimentStatus(round, stages),
    }
  })
}
