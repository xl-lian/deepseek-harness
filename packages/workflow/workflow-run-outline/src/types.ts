/**
 * Pure types of the workflow run outline and the `workflowRuns` projection-key
 * declaration, free of this package's host-side value imports.
 *
 * @module @deepseek-ai/dsh-workflow-run-outline/types
 */

import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionProjectionSummaryExcluded } from '@deepseek-ai/dsh-session-projection/types'
import type { WorkflowRunId, WorkflowStopReason } from '@deepseek-ai/dsh-workflow/types'

export {}

/** Member counts of one run; `started` includes members that have not settled. */
export interface WorkflowRunOutlineMembers {
  readonly started: number
  readonly completed: number
  readonly failed: number
  readonly cancelled: number
}

/** Summary of one metric series of a run. */
export interface WorkflowRunOutlineMetric {
  readonly latest: number
  readonly min: number
  readonly max: number
  readonly count: number
}

/** One workflow run's outline facts, independent of what a client has paged in. */
export interface WorkflowRunOutlineEntry {
  readonly runId: WorkflowRunId
  readonly name: string
  /** The run's `tool-workflow/run-start` event seq. */
  readonly seq: SessionSeq
  /** Unix epoch milliseconds of the recorded start. */
  readonly startedAt: number
  /** Unix epoch milliseconds of the recorded settlement. */
  readonly endedAt?: number
  /** Why the run settled; absent until it does. */
  readonly stopReason?: WorkflowStopReason
  /** True when the run's Turn closed after a crash or at a fork boundary with no settlement recorded. */
  readonly interrupted: boolean
  readonly members: WorkflowRunOutlineMembers
  /** Title of the latest recorded phase. */
  readonly currentPhase?: string
  /** Metric series by name, in first-recorded order. */
  readonly metrics: Readonly<Record<string, WorkflowRunOutlineMetric>>
  /** Turn that started the run. */
  readonly turn: number
}

/** Fold state: the served runs and the open Turn that attributes the next run start. */
export interface WorkflowRunsState {
  /** Runs in start order. */
  readonly runs: readonly WorkflowRunOutlineEntry[]
  /** Number of the latest started Turn; `0` before any. */
  readonly turn: number
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * Every workflow run in the Session with status, timing, and member counts.
     * Excluded from Session summary payloads because no list row renders it.
     */
    workflowRuns: SessionProjectionSummaryExcluded<readonly WorkflowRunOutlineEntry[]>
  }
}
