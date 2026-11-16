/**
 * Activity model: the commands and file changes the agent made outside a
 * recorded loop, grouped by turn. Types are inferred from the zod schemas, so
 * the persisted state, the wire view, and the code that reads them agree.
 * Host only for values; the client imports these types only.
 */

import type {} from '@deepseek-ai/dsh-session-projection/types'
import { z } from 'zod'

/** Lifecycle of one activity step or turn. */
export const activityStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled'])

/** Lifecycle of one activity step or turn. */
export type ActivityStatus = z.infer<typeof activityStatusSchema>

/** One tool call outside a loop: a shell command or a file write or edit. */
export const activityStepSchema = z.object({
  callId: z.string(),
  kind: z.enum(['command', 'edit', 'write']),
  /** The command's description, or the changed file's path. */
  label: z.string(),
  /** The shell command, clipped. */
  command: z.string().optional(),
  status: activityStatusSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  /** Whether the command kept running as a background job after its tool call returned. */
  background: z.boolean(),
  /** Background job id once registered. */
  jobId: z.string().optional(),
  /** Failure reason or terminal job detail, clipped. */
  detail: z.string().optional(),
})

/** One tool call outside a loop: a shell command or a file write or edit. */
export type ActivityStep = z.infer<typeof activityStepSchema>

/** The activity of one turn that made at least one step outside a loop. */
export const activityTurnSchema = z.object({
  turn: z.number(),
  /** The turn's prompt, clipped. */
  headline: z.string().optional(),
  status: activityStatusSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  steps: z.array(activityStepSchema),
  /** Steps not kept because the turn exceeded the step bound. */
  dropped: z.number(),
  /** Files written or edited in the turn, first change first. */
  files: z.array(z.string()),
})

/** The activity of one turn that made at least one step outside a loop. */
export type ActivityTurn = z.infer<typeof activityTurnSchema>

/** The persisted fold state. */
export const activityStateSchema = z.object({
  v: z.literal(1),
  turns: z.array(activityTurnSchema),
  /** Open turn number, set between `turn/start` and `turn/end`. */
  turn: z.number().optional(),
  /** The open turn's prompt, held until its first step. */
  headline: z.string().optional(),
  /** Pending tool call id → its turn number, removed when the result arrives. */
  calls: z.record(z.string(), z.number()),
  /** Unsettled job id → the tool call that created it. */
  jobs: z.record(z.string(), z.string()),
})

/** The persisted fold state. */
export type ActivityState = z.infer<typeof activityStateSchema>

/** The view sent to the browser: the turns only. */
export const activityViewSchema = activityStateSchema.pick({ v: true, turns: true })

/** The view sent to the browser: the turns only. */
export type ActivityView = z.infer<typeof activityViewSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Commands and file changes made outside a recorded loop, grouped by turn, for one Session. */
    scienceResearchActivity: ActivityView
  }
}
