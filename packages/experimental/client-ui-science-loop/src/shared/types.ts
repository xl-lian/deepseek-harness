/**
 * Shared loop model for the host projection and the browser card.
 *
 * The projection state must stay plain JSON (the persisted-cache contract),
 * so every structure here is an object, array, string, number, or boolean.
 */

import type {} from '@deepseek-ai/dsh-session-projection/types'

/** Lifecycle of a loop, round, stage, or member. */
export type LoopStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'blocked'

/** The seven stages rendered by the loop card, in order. */
export type StageId =
  | 'scout'
  | 'hypotheses'
  | 'engineer'
  | 'verifier'
  | 'statistician'
  | 'decide'
  | 'report'

/** Ordered stage ids used by the card and the reducer. */
export const STAGES: readonly StageId[] = [
  'scout',
  'hypotheses',
  'engineer',
  'verifier',
  'statistician',
  'decide',
  'report',
]

/** Default role label for each stage when a member has no more specific role. */
export const STAGE_ROLE: Readonly<Record<StageId, string>> = {
  scout: 'sa-scout',
  hypotheses: 'sa-hypothesis',
  engineer: 'sa-engineer',
  verifier: 'sa-verifier',
  statistician: 'sa-statistician',
  decide: 'orchestrator',
  report: 'orchestrator',
}

/** Where a round's card is anchored in the transcript. */
export interface LoopAnchor {
  readonly kind: 'workflow' | 'direct'
  /** Anchor id shared with the client Definition (`run:<id>` or `call:<id>`). */
  readonly id: string
}

/** Verification verdict values used by stages and members. */
export type LoopVerdict = 'pass' | 'warn' | 'fail'

/** One verifier check (L0–L4) copied from the CLI verdict. */
export interface LoopCheck {
  readonly layer: string
  readonly checkId: string
  readonly status: 'pass' | 'warn' | 'fail' | 'skip'
  readonly severity?: string | undefined
  readonly summary?: string | undefined
}

/** One scout evidence card. */
export interface LoopEvidence {
  readonly sourceType?: string | undefined
  readonly url?: string | undefined
  readonly quote?: string | undefined
  readonly claim?: string | undefined
  readonly support?: string | undefined
}

/** CV recommendation carried by the scout report. */
export interface LoopCv {
  readonly strategy?: string | undefined
  readonly groupColumn?: string | undefined
  readonly timeColumn?: string | undefined
  readonly reason?: string | undefined
}

/** One decision candidate. */
export interface LoopCandidate {
  readonly runId: string
  readonly verifiedMean?: number | undefined
  readonly verifiedSd?: number | undefined
  readonly seeds?: number | undefined
  readonly distinctPredictions?: number | undefined
  readonly note?: string | undefined
  readonly costUsd?: number | undefined
  readonly rank?: number | undefined
}

/** One verified run from `sagent verify design`. */
export interface LoopVerifiedRun {
  readonly runId: string
  readonly label?: string | undefined
  readonly value?: number | undefined
  readonly seed?: number | undefined
}

/** Round-level design review recorded by `sagent verify design`. */
export interface LoopDesign {
  readonly baselineRunId?: string | undefined
  readonly baselineValue?: number | undefined
  readonly best?: LoopVerifiedRun | undefined
  readonly delta?: number | undefined
  readonly multipleComparisons?: number | undefined
  readonly distinctOofTotal?: number | undefined
  readonly verifiedRuns: readonly LoopVerifiedRun[]
}

/** One report strict-check issue. */
export interface LoopReportIssue {
  readonly line?: number | undefined
  readonly token?: string | undefined
  readonly text?: string | undefined
  readonly kind?: string | undefined
}

/** One workflow member, direct subagent call, or orchestrator CLI step. */
export interface LoopMember {
  readonly id: string
  readonly label: string
  readonly role: string
  readonly agent: string
  readonly kind: 'workflow' | 'tool' | 'command'
  readonly status: LoopStatus
  readonly startedAt?: number | undefined
  readonly endedAt?: number | undefined
  readonly outcome?: string | undefined
  readonly childId?: string | undefined
  readonly callId?: string | undefined
  readonly summary?: string | undefined
  readonly output?: string | undefined
  readonly verdict?: LoopVerdict | undefined
  readonly repairable?: boolean | undefined
  readonly runIds?: readonly string[] | undefined
  readonly metrics?: Readonly<Record<string, number>> | undefined
  /** Engineer/repair implementation summary. */
  readonly plan?: string | undefined
  /** Files created or edited by the engineer. */
  readonly files?: readonly string[] | undefined
  /** Verifier trust level. */
  readonly trust?: string | undefined
  readonly blockingFailures?: readonly string[] | undefined
  readonly warnings?: readonly string[] | undefined
  readonly checks?: readonly LoopCheck[] | undefined
  readonly metricsVerified?: Readonly<Record<string, number>> | undefined
  /** Engine run status or verifier verdict/trust line. */
  readonly statusDetail?: string | undefined
  readonly notes?: string | undefined
  readonly repaired?: boolean | undefined
}

/** One stage of a round and the members that ran inside it. */
export interface LoopStage {
  readonly id: StageId
  readonly status: LoopStatus
  readonly startedAt?: number | undefined
  readonly endedAt?: number | undefined
  readonly summary?: string | undefined
  readonly verdict?: 'pass' | 'warn' | 'fail' | undefined
  readonly members: readonly LoopMember[]
  /** Last explicit `sagent round stage` mark, applied only when no later member started. */
  readonly explicit?: { readonly status: LoopStatus; readonly seq: number } | undefined
}

/** Scout output carried by the workflow's structured return. */
export interface LoopScout {
  readonly summary: string
  readonly metric?: string | undefined
  readonly taskType?: string | undefined
  readonly rowsTrain?: number | undefined
  readonly columns?: number | undefined
  readonly cv?: LoopCv | undefined
  readonly baselinePresent?: boolean | undefined
  readonly risks: readonly string[]
  readonly evidence: readonly LoopEvidence[]
}

/** One registered hypothesis carried by the workflow's structured return. */
export interface LoopHypothesis {
  readonly hypothesisId?: string | undefined
  readonly experimentId?: string | undefined
  readonly statement: string
  readonly prediction?: string | undefined
  readonly rationale?: string | undefined
  readonly design?: string | undefined
  readonly seeds?: readonly number[] | undefined
  readonly expectedDelta?: number | undefined
  readonly cost?: string | undefined
  readonly leakageRisk?: string | undefined
  readonly cvDesign?: string | undefined
}

/** Statistician (L3 design) output carried by the workflow's structured return. */
export interface LoopL3 {
  readonly roundSummary?: string | undefined
  readonly seedVariance?: string | undefined
  readonly multipleComparisons?: string | undefined
  readonly budgetFairness?: string | undefined
  readonly stopRecommended?: boolean | undefined
  readonly notes?: string | undefined
}

/** Deterministic decision recorded by `sagent decide`. */
export interface LoopDecision {
  readonly chosenRunId?: string | undefined
  readonly rationaleCode?: string | undefined
  readonly eliminated: readonly { readonly runId: string; readonly reason: string }[]
  readonly candidates: readonly LoopCandidate[]
  readonly budgetUsed?: Readonly<Record<string, number | string>> | undefined
}

/** Report build/check result recorded by `sagent report`. */
export interface LoopReport {
  readonly path?: string | undefined
  /** Whether the last strict check passed. */
  readonly ok?: boolean | undefined
  /** Whether strict mode was requested. */
  readonly strict?: boolean | undefined
  readonly issues: readonly LoopReportIssue[]
}

/** One auditable round and its seven-stage trajectory. */
export interface LoopRound {
  /** Projection-local stable identity (`round-<startedSeq>`). */
  readonly id: string
  /** sagent round id (`rd-...`) once observed. */
  readonly roundId?: string | undefined
  readonly mode?: string | undefined
  readonly status: LoopStatus
  readonly startedAt?: number | undefined
  readonly endedAt?: number | undefined
  readonly anchor: LoopAnchor
  /** Candidate anchors that map to this round but must not render a card. */
  readonly suppressedAnchors: readonly string[]
  readonly stages: Readonly<Record<StageId, LoopStage>>
  readonly workflow?: {
    readonly callId?: string | undefined
    readonly runId?: string | undefined
    readonly stopReason?: string | undefined
    readonly error?: string | undefined
    readonly startedAt?: number | undefined
  }
  readonly scout?: LoopScout | undefined
  readonly hypotheses?: readonly LoopHypothesis[] | undefined
  readonly l3?: LoopL3 | undefined
  readonly decision?: LoopDecision | undefined
  readonly report?: LoopReport | undefined
  readonly design?: LoopDesign | undefined
}

/** One in-flight tool call and the round it belongs to. */
export interface LoopCallBinding {
  readonly roundId: string
  readonly purposes: readonly CallPurpose[]
  /** Stage name captured from a `round stage` call, used when its result omits it. */
  readonly stageName?: string | undefined
  /** Outcome captured from a `round end` call, used when its result is not JSON. */
  readonly roundOutcome?: string | undefined
}

/** What a tool call contributes to the loop. */
export type CallPurpose =
  | 'workflow'
  | 'round-begin'
  | 'round-stage'
  | 'round-end'
  | 'decide'
  | 'report'
  | 'scout'
  | 'hypothesis'
  | 'engineer'
  | 'verifier'
  | 'statistician'
  | 'ignore'

/** Host fold state (persisted projection cache value). */
export interface LoopState {
  readonly v: 1
  readonly rounds: readonly LoopRound[]
  /** callId -> binding, removed when the result settles. */
  readonly calls: Readonly<Record<string, LoopCallBinding>>
  /** workflow runId -> round id. */
  readonly runs: Readonly<Record<string, string>>
  readonly activeRoundId?: string | undefined
  /** Current Agent preset, seeded from the Session header and updated by selection events. */
  readonly agentPreset?: string | null | undefined
  /** Whether this Session loaded a science-agent skill, even if no round started. */
  readonly scienceSkillLoaded?: boolean | undefined
}

/** Client-visible projection value. */
export interface LoopView {
  readonly v: 1
  readonly rounds: readonly LoopRound[]
  readonly activeRoundId?: string | undefined
  /** Current Agent preset, or null before one is recorded. */
  readonly agentPreset: string | null
  /** Whether a science-agent skill was loaded without necessarily starting a round. */
  readonly scienceSkillLoaded: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Live science-agent loop rounds for one session. */
    scienceAgentLoop: LoopView
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** A blank Session selected the Agent preset it will run. */
    'agent-preset/selected': { agentPreset: string }
  }
}
