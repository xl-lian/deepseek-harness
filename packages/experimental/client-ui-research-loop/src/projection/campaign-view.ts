/**
 * State -> wire view. The wire value is bounded so a long session cannot bloat
 * projection snapshots (0.1.7 has no summary exclusion for large views).
 */

import {
  STAGES,
  type LoopCandidate,
  type LoopCheck,
  type LoopDecision,
  type LoopDesign,
  type LoopEvidence,
  type LoopHypothesis,
  type LoopMember,
  type LoopReport,
  type LoopReportIssue,
  type LoopRound,
  type LoopScout,
  type LoopStage,
  type CampaignState,
  type CampaignView,
} from '../shared/campaign-types.ts'

const MAX_ROUNDS = 50
const MAX_MEMBERS_PER_STAGE = 50
const MAX_SUPPRESSED_ANCHORS = 20
const MAX_SUMMARY_CHARS = 512
const MAX_OUTPUT_CHARS = 4096
const MAX_PLAN_CHARS = 800
const MAX_NOTES_CHARS = 400
const MAX_STATUS_CHARS = 200
const MAX_FILE_CHARS = 200
const MAX_FILES = 20
const MAX_CHECKS = 32
const MAX_CHECK_CHARS = 240
const MAX_FLAGS = 8
const MAX_EVIDENCE = 8
const MAX_HYPOTHESES = 12
const MAX_CANDIDATES = 12
const MAX_ISSUES = 20
const MAX_VERIFIED_RUNS = 20
const MAX_METRICS = 12

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

function clipList(value: readonly string[] | undefined, limit: number, itemLimit: number): string[] | undefined {
  return value === undefined ? undefined : value.slice(0, limit).map(item => clip(item, itemLimit))
}

function metrics(value: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> | undefined {
  return value === undefined ? undefined : Object.fromEntries(Object.entries(value).slice(0, MAX_METRICS))
}

function sanitizeChecks(value: readonly LoopCheck[] | undefined): LoopCheck[] | undefined {
  return value === undefined ? undefined : value.slice(0, MAX_CHECKS).map(check => ({
    ...check,
    ...(check.summary === undefined ? {} : { summary: clip(check.summary, MAX_CHECK_CHARS) }),
  }))
}

function sanitizeMember(member: LoopMember): LoopMember {
  return {
    ...member,
    ...(member.summary === undefined ? {} : { summary: clip(member.summary, MAX_SUMMARY_CHARS) }),
    ...(member.output === undefined ? {} : { output: clip(member.output, MAX_OUTPUT_CHARS) }),
    ...(member.plan === undefined ? {} : { plan: clip(member.plan, MAX_PLAN_CHARS) }),
    ...(member.notes === undefined ? {} : { notes: clip(member.notes, MAX_NOTES_CHARS) }),
    ...(member.statusDetail === undefined ? {} : { statusDetail: clip(member.statusDetail, MAX_STATUS_CHARS) }),
    ...(member.trust === undefined ? {} : { trust: clip(member.trust, MAX_STATUS_CHARS) }),
    ...(member.files === undefined ? {} : { files: clipList(member.files, MAX_FILES, MAX_FILE_CHARS) }),
    ...(member.blockingFailures === undefined ? {} : { blockingFailures: clipList(member.blockingFailures, MAX_FLAGS, MAX_CHECK_CHARS) }),
    ...(member.warnings === undefined ? {} : { warnings: clipList(member.warnings, MAX_FLAGS, MAX_CHECK_CHARS) }),
    ...(member.checks === undefined ? {} : { checks: sanitizeChecks(member.checks) }),
    ...(member.metrics === undefined ? {} : { metrics: metrics(member.metrics) }),
    ...(member.metricsVerified === undefined ? {} : { metricsVerified: metrics(member.metricsVerified) }),
  }
}

function sanitizeStage(stage: LoopStage): LoopStage {
  return {
    id: stage.id,
    status: stage.status,
    ...(stage.startedAt === undefined ? {} : { startedAt: stage.startedAt }),
    ...(stage.endedAt === undefined ? {} : { endedAt: stage.endedAt }),
    ...(stage.summary === undefined ? {} : { summary: clip(stage.summary, MAX_SUMMARY_CHARS) }),
    ...(stage.verdict === undefined ? {} : { verdict: stage.verdict }),
    members: stage.members.slice(-MAX_MEMBERS_PER_STAGE).map(sanitizeMember),
  }
}

function sanitizeScout(scout: LoopScout | undefined): LoopScout | undefined {
  if (scout === undefined) return undefined
  return {
    ...scout,
    summary: clip(scout.summary, MAX_SUMMARY_CHARS),
    ...(scout.cv === undefined ? {} : { cv: scout.cv }),
    risks: clipList(scout.risks, 8, MAX_SUMMARY_CHARS) ?? [],
    evidence: scout.evidence.slice(0, MAX_EVIDENCE).map((card: LoopEvidence) => ({
      ...card,
      ...(card.quote === undefined ? {} : { quote: clip(card.quote, MAX_SUMMARY_CHARS) }),
      ...(card.claim === undefined ? {} : { claim: clip(card.claim, MAX_SUMMARY_CHARS) }),
    })),
  }
}

function sanitizeHypotheses(value: readonly LoopHypothesis[] | undefined): LoopHypothesis[] | undefined {
  return value === undefined ? undefined : value.slice(0, MAX_HYPOTHESES).map(hypothesis => ({
    ...hypothesis,
    statement: clip(hypothesis.statement, MAX_SUMMARY_CHARS),
    ...(hypothesis.prediction === undefined ? {} : { prediction: clip(hypothesis.prediction, MAX_SUMMARY_CHARS) }),
    ...(hypothesis.rationale === undefined ? {} : { rationale: clip(hypothesis.rationale, MAX_SUMMARY_CHARS) }),
    ...(hypothesis.design === undefined ? {} : { design: clip(hypothesis.design, MAX_SUMMARY_CHARS) }),
    ...(hypothesis.cvDesign === undefined ? {} : { cvDesign: clip(hypothesis.cvDesign, MAX_SUMMARY_CHARS) }),
  }))
}

function sanitizeCandidates(value: readonly LoopCandidate[] | undefined): LoopCandidate[] | undefined {
  return value === undefined ? undefined : value.slice(0, MAX_CANDIDATES).map(candidate => ({
    ...candidate,
    ...(candidate.note === undefined ? {} : { note: clip(candidate.note, MAX_SUMMARY_CHARS) }),
  }))
}

function sanitizeDesign(design: LoopDesign | undefined): LoopDesign | undefined {
  return design === undefined ? undefined : { ...design, verifiedRuns: design.verifiedRuns.slice(0, MAX_VERIFIED_RUNS) }
}

function sanitizeDecision(decision: LoopDecision | undefined): LoopDecision | undefined {
  if (decision === undefined) return undefined
  return {
    ...decision,
    eliminated: decision.eliminated.slice(0, 20),
    candidates: sanitizeCandidates(decision.candidates) ?? [],
  }
}

function sanitizeIssue(issue: LoopReportIssue): LoopReportIssue {
  return {
    ...issue,
    ...(issue.text === undefined ? {} : { text: clip(issue.text, MAX_SUMMARY_CHARS) }),
    ...(issue.token === undefined ? {} : { token: clip(issue.token, 120) }),
  }
}

function sanitizeReport(report: LoopReport | undefined): LoopReport | undefined {
  return report === undefined ? undefined : { ...report, issues: report.issues.slice(0, MAX_ISSUES).map(sanitizeIssue) }
}

function sanitizeRound(round: LoopRound): LoopRound {
  return {
    ...round,
    suppressedAnchors: round.suppressedAnchors.slice(-MAX_SUPPRESSED_ANCHORS),
    stages: Object.fromEntries(
      STAGES.map(id => [id, sanitizeStage(round.stages[id])]),
    ) as Record<(typeof STAGES)[number], LoopStage>,
    scout: sanitizeScout(round.scout),
    hypotheses: sanitizeHypotheses(round.hypotheses),
    decision: sanitizeDecision(round.decision),
    report: sanitizeReport(round.report),
    design: sanitizeDesign(round.design),
  }
}

/**
 * Project campaign fold state into the bounded client value.
 * @param state - campaign fold state.
 * @returns the last rounds, each with bounded members and text.
 */
export function toCampaignView(state: CampaignState): CampaignView {
  return {
    rounds: state.rounds.slice(-MAX_ROUNDS).map(sanitizeRound),
    ...(state.activeRoundId === undefined ? {} : { activeRoundId: state.activeRoundId }),
  }
}
