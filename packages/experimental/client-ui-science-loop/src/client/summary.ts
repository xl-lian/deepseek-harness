/**
 * Pure summary helpers for the Loop view: which stage is current, and the
 * short lines shown on each stage card.
 */

import { latestAttempts } from '../shared/stage.ts'
import { STAGES, type LoopStage, type LoopRound, type StageId } from '../shared/types.ts'
import type { LoopTranslate } from './parts.tsx'

function latestActivity(stage: LoopStage): number {
  let latest = stage.endedAt ?? stage.startedAt ?? 0
  for (const member of stage.members) latest = Math.max(latest, member.endedAt ?? member.startedAt ?? 0)
  return latest
}

function pickNewest(round: LoopRound, ids: readonly StageId[]): StageId | undefined {
  let best: StageId | undefined
  let bestTime = -1
  for (const id of ids) {
    const time = latestActivity(round.stages[id])
    if (time > bestTime || (time === bestTime && best !== undefined && STAGES.indexOf(id) > STAGES.indexOf(best))) {
      best = id
      bestTime = time
    }
  }
  return best
}

/** The running stage, else the most recently active non-pending stage. */
export function currentStage(round: LoopRound): StageId | undefined {
  const running = STAGES.filter(id => round.stages[id].status === 'running')
  if (running.length > 0) return pickNewest(round, running)
  const active = STAGES.filter((id) => {
    const stage = round.stages[id]
    return stage.members.length > 0 || stage.status !== 'pending'
  })
  return active.length === 0 ? undefined : pickNewest(round, active)
}

function formatMetrics(metrics: Readonly<Record<string, number>>): string {
  return Object.entries(metrics)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${Number.isInteger(value) ? value : value.toFixed(4)}`)
    .join(' · ')
}

/** At most three short summary lines for one stage card. */
export function stageSummary(round: LoopRound, id: StageId, t: LoopTranslate): string[] {
  const stage = round.stages[id]
  const lines: string[] = []

  if (id === 'scout') {
    const scout = round.scout
    if (scout !== undefined) {
      const profile = [
        scout.taskType,
        scout.metric,
        scout.rowsTrain !== undefined && scout.columns !== undefined ? `${scout.rowsTrain}×${scout.columns}` : undefined,
      ].filter((part): part is string => part !== undefined).join(' · ')
      if (profile.length > 0) lines.push(profile)
      const cv = scout.cv?.strategy === undefined ? undefined : `CV ${scout.cv.strategy}`
      const baseline = scout.baselinePresent === undefined
        ? undefined
        : t(scout.baselinePresent ? 'summary.baseline' : 'summary.noBaseline')
      const second = [cv, baseline].filter((part): part is string => part !== undefined).join(' · ')
      if (second.length > 0) lines.push(second)
      if (scout.risks[0] !== undefined) lines.push(scout.risks[0])
      if (lines.length === 0) lines.push(scout.summary)
    }
  }

  if (id === 'hypotheses') {
    const hypotheses = round.hypotheses ?? []
    if (hypotheses.length > 0) {
      lines.push(t('summary.hypotheses.count', { count: String(hypotheses.length) }))
      for (const hypothesis of hypotheses.slice(0, 2)) {
        lines.push(hypothesis.hypothesisId === undefined
          ? hypothesis.statement
          : t('summary.hypotheses.item', { id: hypothesis.hypothesisId, statement: hypothesis.statement }))
      }
    }
  }

  if (id === 'engineer') {
    const attempts = latestAttempts(stage)
    if (attempts.length > 1) lines.push(t('summary.engineer.pipelines', { count: String(attempts.length) }))
    const latest = [...attempts].sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0))[0]
    if (latest !== undefined) {
      if (latest.plan !== undefined) lines.push(t('summary.engineer.plan', { plan: latest.plan }))
      else if (latest.notes !== undefined) lines.push(latest.notes)
      if (latest.metrics !== undefined) {
        const run = latest.runIds?.[0]
        lines.push(run === undefined ? formatMetrics(latest.metrics) : `run ${run} · ${formatMetrics(latest.metrics)}`)
      }
      if (latest.repaired === true) lines.push(t('summary.engineer.repaired'))
    }
  }

  if (id === 'verifier') {
    const attempts = latestAttempts(stage)
    const counts = { pass: 0, warn: 0, fail: 0 }
    for (const member of attempts) {
      if (member.verdict !== undefined) counts[member.verdict] += 1
    }
    if (attempts.some(member => member.verdict !== undefined)) {
      lines.push(t('summary.verifier.counts', {
        pass: String(counts.pass),
        warn: String(counts.warn),
        fail: String(counts.fail),
      }))
    }
    const trust = attempts.find(member => member.trust !== undefined)?.trust
    if (trust !== undefined) lines.push(t('summary.verifier.trust', { trust }))
    const blocking = attempts.flatMap(member => member.blockingFailures ?? [])[0]
    const warning = attempts.flatMap(member => member.warnings ?? [])[0]
    if (blocking !== undefined) lines.push(t('summary.verifier.blocking', { text: blocking }))
    else if (warning !== undefined) lines.push(warning)
  }

  if (id === 'statistician') {
    const l3 = round.l3
    if (l3?.roundSummary !== undefined) lines.push(l3.roundSummary)
    if (l3?.seedVariance !== undefined) lines.push(l3.seedVariance)
    else if (l3?.multipleComparisons !== undefined) lines.push(l3.multipleComparisons)
    if (round.design?.best !== undefined) {
      lines.push(t('summary.statistician.best', {
        run: round.design.best.runId,
        value: String(round.design.best.value ?? '—'),
        delta: round.design.delta === undefined ? '' : ` (Δ ${round.design.delta})`,
      }))
    }
  }

  if (id === 'decide') {
    const decision = round.decision
    if (decision !== undefined) {
      lines.push(t('summary.decide.chosen', {
        run: decision.chosenRunId ?? '—',
        rationale: decision.rationaleCode ?? 'n/a',
      }))
      if (decision.candidates.length > 0 || decision.eliminated.length > 0) {
        lines.push(t('summary.decide.candidates', {
          count: String(decision.candidates.length),
          eliminated: String(decision.eliminated.length),
        }))
      }
      if (decision.budgetUsed !== undefined) {
        lines.push(Object.entries(decision.budgetUsed).slice(0, 2).map(([key, value]) => `${key}=${String(value)}`).join(' · '))
      }
    }
  }

  if (id === 'report') {
    const report = round.report
    if (report !== undefined) {
      if (report.path !== undefined) lines.push(t('summary.report.path', { path: report.path }))
      if (report.ok !== undefined) lines.push(t(report.ok ? 'summary.report.result.ok' : 'summary.report.result.failed'))
      if (report.issues.length > 0) {
        const issue = report.issues[0]
        if (issue !== undefined && (issue.token !== undefined || issue.text !== undefined)) {
          lines.push(t('summary.report.issue', {
            line: String(issue.line ?? '?'),
            token: issue.token ?? issue.text ?? '',
          }))
        } else {
          lines.push(t('summary.report.issues', { count: String(report.issues.length) }))
        }
      }
    }
  }

  if (lines.length === 0) {
    if (stage.summary !== undefined) lines.push(stage.summary)
    const latest = [...stage.members].sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0))[0]
    if (lines.length === 0 && latest?.summary !== undefined) lines.push(latest.summary)
  }
  return lines.filter(line => line.trim().length > 0).slice(0, 3)
}
