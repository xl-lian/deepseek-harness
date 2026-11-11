/**
 * Browser-safe durable workflow-record events written by the model-facing
 * workflow tool into its calling parent Session.
 *
 * @module @deepseek-ai/dsh-tool-workflow/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  WorkflowAgentOutcome, WorkflowRunId, WorkflowStopReason,
} from '@deepseek-ai/dsh-workflow/types'

/** Opens one durable top-level workflow run record. */
export interface ToolWorkflowRunStartData {
  readonly runId: WorkflowRunId
  readonly name: string
  /** Lowercase hexadecimal SHA-256 of the script body, present for a saved workflow. */
  readonly scriptSha256?: string
}

/** Records one workflow member after its child Session is published. */
export interface ToolWorkflowAgentStartData {
  readonly runId: WorkflowRunId
  readonly seq: number
  readonly label: string
  readonly phase?: string
  readonly childId: SessionId
}

/** Settles one previously started workflow member. */
export interface ToolWorkflowAgentEndData {
  readonly runId: WorkflowRunId
  readonly seq: number
  readonly outcome: WorkflowAgentOutcome
}

/** Records one `phase()` call of a top-level run. */
export interface ToolWorkflowPhaseData {
  readonly runId: WorkflowRunId
  readonly title: string
}

/** Records one `log()` call of a top-level run; a line over the configured length is clipped. */
export interface ToolWorkflowLogData {
  readonly runId: WorkflowRunId
  readonly message: string
}

/** Settles one workflow run after its live resources reach quiescence. */
export interface ToolWorkflowRunEndData {
  readonly runId: WorkflowRunId
  readonly stopReason: WorkflowStopReason
  /** Phase and log records skipped by the recording caps; absent when none were. */
  readonly progressEventsDropped?: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one top-level workflow record.
     * @param data - stable run identity and display name.
     */
    'tool-workflow/run-start': ToolWorkflowRunStartData
    /**
     * Records one published workflow member.
     * @param data - run identity, member sequence, display identity, and child Session.
     */
    'tool-workflow/agent-start': ToolWorkflowAgentStartData
    /**
     * Records one member settlement.
     * @param data - run identity, paired member sequence, and outcome.
     */
    'tool-workflow/agent-end': ToolWorkflowAgentEndData
    /**
     * Records one script phase transition as narration; phases impose no execution structure.
     * @param data - run identity and verbatim or clipped phase title.
     */
    'tool-workflow/phase': ToolWorkflowPhaseData
    /**
     * Records one script narration line.
     * @param data - run identity and verbatim or clipped message.
     */
    'tool-workflow/log': ToolWorkflowLogData
    /**
     * Closes one workflow record after cleanup.
     * @param data - stable run identity, terminal reason, and any dropped progress count.
     */
    'tool-workflow/run-end': ToolWorkflowRunEndData
  }
}
