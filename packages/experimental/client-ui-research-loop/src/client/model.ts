/**
 * Display model derived from the research loop view: stage status per round,
 * focus rows, and experiment rows that join what the loop narrated with the
 * latest `sagent research status` ledger. Pure functions over the view.
 */

import { memberStage } from '../shared/labels.ts'
import { RESEARCH_STAGES, type ResearchStageId } from '../shared/constants.ts'
import type {
  LedgerExperiment,
  LedgerRound,
  MemberKind,
  ResearchExperiment,
  ResearchMember,
  ResearchRound,
  ResearchRun,
  ResearchStatus,
  ResearchView,
} from '../shared/schema.ts'

/** Status of a set of members: running wins, then failure, then completion. */
function membersStatus(members: readonly ResearchMember[]): ResearchStatus {
  if (members.length === 0) return 'pending'
  if (members.some(member => member.status === 'running')) return 'running'
  if (members.some(member => member.status === 'failed')) return 'failed'
  if (members.some(member => member.status === 'cancelled')) return 'cancelled'
  return 'completed'
}

/**
 * Status of one stage of a round.
 * @param round - the round.
 * @param stage - the stage.
 * @returns the members' status; a stage the round has moved past without members counts as completed.
 */
export function stageStatus(round: ResearchRound, stage: ResearchStageId): ResearchStatus {
  const status = membersStatus(round.members.filter(member => memberStage(member) === stage))
  if (status !== 'pending') return status
  const later = RESEARCH_STAGES.slice(RESEARCH_STAGES.indexOf(stage) + 1)
  const reached = later.some(next => round.members.some(member => memberStage(member) === next))
  if (reached || round.status === 'completed') return 'completed'
  return round.status === 'running' ? 'pending' : round.status
}

/**
 * The stage a running round is in.
 * @param round - the round.
 * @returns the last stage with a running member, else `undefined`.
 */
export function activeStage(round: ResearchRound): ResearchStageId | undefined {
  return [...RESEARCH_STAGES].reverse().find(stage => stageStatus(round, stage) === 'running')
}

/** One reading focus of a round. */
export interface FocusRow {
  readonly id: string
  readonly status: ResearchStatus
  readonly childId?: string | undefined
}

/**
 * Reading focuses in first-read order, each with its latest reader's status.
 * @param round - the round.
 * @returns one row per focus id.
 */
export function focusRows(round: ResearchRound): FocusRow[] {
  const rows = new Map<string, FocusRow>()
  for (const member of round.members) {
    if (member.kind !== 'read' || member.focusId === undefined) continue
    rows.set(member.focusId, { id: member.focusId, status: member.status, childId: member.childId })
  }
  return [...rows.values()]
}

/** One experiment row joined with its ledger entry. */
export interface ExperimentRow {
  readonly id: string
  readonly loop: ResearchExperiment
  readonly ledger?: LedgerExperiment | undefined
  readonly members: readonly ResearchMember[]
  readonly status: ResearchStatus
  /** Attempts per member kind, in loop order. */
  readonly attempts: readonly (readonly [MemberKind, number])[]
}

const ATTEMPT_KINDS: readonly MemberKind[] = ['build', 'run', 'debug', 'check', 'challenge', 'recheck']

/**
 * Experiment rows of a round, in plan order.
 * @param round - the round.
 * @param ledger - the ledger entry for the same round, if any.
 * @returns rows joining loop facts, ledger facts, and the experiment's members.
 */
export function experimentRows(round: ResearchRound, ledger: LedgerRound | undefined): ExperimentRow[] {
  const ids = [...round.experiments.map(experiment => experiment.id)]
  for (const entry of ledger?.experiments ?? []) if (!ids.includes(entry.id)) ids.push(entry.id)
  return ids.map((id) => {
    const members = round.members.filter(member => member.experimentId === id && member.kind !== 'save')
    const loop = round.experiments.find(experiment => experiment.id === id) ?? { id }
    const attempts = ATTEMPT_KINDS
      .map(kind => [kind, members.filter(member => member.kind === kind).length] as const)
      .filter(([, count]) => count > 0)
    return { id, loop, ledger: ledger?.experiments.find(entry => entry.id === id), members, status: membersStatus(members), attempts }
  })
}

/**
 * The ledger round matching a loop round.
 * @param view - the projection view.
 * @param round - the loop round.
 * @returns the ledger entry with the same round id, if any.
 */
export function ledgerRound(view: ResearchView, round: ResearchRound): LedgerRound | undefined {
  const rounds = view.ledger?.rounds ?? []
  return rounds.find(entry => round.roundId !== undefined && entry.roundId === round.roundId)
}

/**
 * The run whose rounds the dock and Chat card follow.
 * @param view - the projection view.
 * @returns the running run, else the latest.
 */
export function currentRun(view: ResearchView | undefined): ResearchRun | undefined {
  if (view === undefined) return undefined
  return [...view.runs].reverse().find(run => run.status === 'running') ?? view.runs[view.runs.length - 1]
}

/**
 * Elapsed milliseconds of a span.
 * @param startedAt - start time.
 * @param endedAt - end time, or `undefined` while running.
 * @param now - current time.
 * @returns the elapsed time, or `undefined` without a start.
 */
export function elapsed(startedAt: number | undefined, endedAt: number | undefined, now: number): number | undefined {
  return startedAt === undefined ? undefined : Math.max(0, (endedAt ?? now) - startedAt)
}

/**
 * `m:ss` or `h:mm:ss` duration text.
 * @param milliseconds - duration.
 * @returns the formatted duration.
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  const [hours = 0, minutes = 0, rest = 0] = parts
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`
}
