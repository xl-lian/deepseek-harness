/**
 * Stage derivation shared by the host fold and the client experiment rings:
 * which hypothesis a workflow member belongs to, which attempt of each
 * hypothesis is current, and the status and verdict a stage takes from them.
 */

import type { LoopMember, LoopStage, LoopStatus, LoopVerdict } from './campaign-types.ts'

const EXPERIMENT_LABEL = /^(?:engineer|repair|confirm|verify-confirm|verify|reverify)-(.+)$/

/**
 * Hypothesis id carried by a science workflow Engineer or Verifier member label.
 * @param label - member label such as `engineer-h-1` or `verify-confirm-h-1`.
 * @returns the hypothesis id, or `undefined` for labels outside the per-hypothesis pipeline.
 */
export function experimentKeyOf(label: string): string | undefined {
  return EXPERIMENT_LABEL.exec(label)?.[1]
}

/**
 * Whether a status is final.
 * @param status - loop status.
 * @returns `true` for every status except `pending` and `running`.
 */
export function isSettled(status: LoopStatus): boolean {
  return status !== 'pending' && status !== 'running'
}

function attemptKey(stage: LoopStage, member: LoopMember): string {
  if (stage.id === 'engineer' || stage.id === 'verifier') return experimentKeyOf(member.label) ?? member.id
  return member.id
}

/**
 * The latest-started member per hypothesis in Engineer and Verifier, and every member elsewhere.
 * @param stage - stage whose members are grouped.
 * @returns one member per attempt key, in first-seen key order.
 */
export function latestAttempts(stage: LoopStage): LoopMember[] {
  const latest = new Map<string, LoopMember>()
  for (const member of stage.members) {
    const key = attemptKey(stage, member)
    const previous = latest.get(key)
    if (previous === undefined || (member.startedAt ?? 0) >= (previous.startedAt ?? 0)) latest.set(key, member)
  }
  return [...latest.values()]
}

/**
 * Worst verdict among a stage's latest attempts.
 * @param stage - stage to read.
 * @returns `fail` before `warn` before `pass`, or `undefined` when no attempt has a verdict.
 */
export function stageVerdict(stage: LoopStage): LoopVerdict | undefined {
  const verdicts = latestAttempts(stage)
    .map(member => member.verdict)
    .filter((value): value is LoopVerdict => value !== undefined)
  if (verdicts.includes('fail')) return 'fail'
  if (verdicts.includes('warn')) return 'warn'
  if (verdicts.length > 0) return 'pass'
  return undefined
}

/**
 * Recompute a stage's status, time span, and verdict from its members.
 * A memberless stage takes its explicit `sagent round stage` mark, else `pending`.
 * @param stage - stage with current members.
 * @returns the stage with derived fields, or the same reference when a memberless stage is already pending.
 */
export function deriveStage(stage: LoopStage): LoopStage {
  if (stage.members.length === 0) {
    if (stage.explicit !== undefined) {
      return { ...stage, status: stage.explicit.status }
    }
    return stage.status === 'pending' ? stage : { ...stage, status: 'pending' }
  }
  const attempts = latestAttempts(stage)
  let status: LoopStatus
  if (attempts.some(member => member.status === 'running')) status = 'running'
  else if (attempts.some(member => member.status === 'failed' || member.status === 'blocked')) status = 'failed'
  else if (attempts.some(member => member.status === 'cancelled')) status = 'cancelled'
  else if (attempts.some(member => member.status === 'interrupted')) status = 'interrupted'
  else if (attempts.every(member => member.status === 'completed')) status = 'completed'
  else status = 'running'

  const starts = stage.members.map(member => member.startedAt).filter((value): value is number => value !== undefined)
  const ends = stage.members.map(member => member.endedAt).filter((value): value is number => value !== undefined)
  const settled = attempts.every(member => isSettled(member.status))
  const verdict = stageVerdict(stage)
  return {
    ...stage,
    status,
    startedAt: starts.length === 0 ? stage.startedAt : Math.min(...starts),
    endedAt: settled && ends.length === stage.members.length ? Math.max(...ends) : undefined,
    ...(verdict === undefined ? {} : { verdict }),
  }
}

/**
 * The first three metrics as `name=value`, four decimals for non-integers.
 * @param metrics - metric name → value.
 * @returns the metrics joined by ` · `.
 */
export function formatMetrics(metrics: Readonly<Record<string, number>>): string {
  return Object.entries(metrics)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${Number.isInteger(value) ? value : value.toFixed(4)}`)
    .join(' · ')
}
