/**
 * The `workflowRuns` projection unit: a pure fold of `tool-workflow/*` records
 * and Turn boundaries into one row per run. Only the rows are served; a Turn
 * boundary changes the attribution counter without changing the rows' identity,
 * so the change feed stays quiet between run updates.
 *
 * @module @deepseek-ai/dsh-workflow-run-outline/projection
 */

import { z } from 'zod'
import type { ZodType } from 'zod'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { WorkflowRunId } from '@deepseek-ai/dsh-workflow/types'
import type { WorkflowRunId as WorkflowRunIdType } from '@deepseek-ai/dsh-workflow/types'
import type { WorkflowRunOutlineEntry, WorkflowRunsState } from './types.ts'

const count = z.number().int().nonnegative()

const entriesSchema: ZodType<readonly WorkflowRunOutlineEntry[]> = z.array(z.object({
  runId: z.string().transform(WorkflowRunId),
  name: z.string(),
  seq: count.transform(SessionSeq),
  startedAt: z.number(),
  endedAt: z.number().exactOptional(),
  stopReason: z.enum(['completed', 'cancelled', 'error']).exactOptional(),
  interrupted: z.boolean(),
  members: z.object({ started: count, completed: count, failed: count, cancelled: count }).strict(),
  currentPhase: z.string().exactOptional(),
  turn: count,
}).strict())

const stateSchema: ZodType<WorkflowRunsState> = z.object({ runs: entriesSchema, turn: count }).strict()

const EMPTY: WorkflowRunsState = { runs: [], turn: 0 }

function updateRun(
  state: WorkflowRunsState,
  runId: WorkflowRunIdType,
  update: (entry: WorkflowRunOutlineEntry) => WorkflowRunOutlineEntry,
): WorkflowRunsState {
  const target = state.runs.findLast(entry => entry.runId === runId)
  if (target === undefined) return state
  return { ...state, runs: state.runs.map(entry => entry === target ? update(entry) : entry) }
}

/** The `workflowRuns` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const workflowRunsProjectionDefinition = {
  key: 'workflowRuns',
  stateVersion: 1,
  stateSchema,
  init: () => EMPTY,
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return { ...state, turn: event.data.turn }
      case 'turn/end': {
        const { kind } = event.data.reason
        if (kind !== 'interrupted' && kind !== 'forked') return state
        const abandoned = (entry: WorkflowRunOutlineEntry): boolean => entry.turn === event.data.turn
          && entry.stopReason === undefined && !entry.interrupted
        if (!state.runs.some(abandoned)) return state
        return { ...state, runs: state.runs.map(entry => abandoned(entry) ? { ...entry, interrupted: true } : entry) }
      }
      case 'tool-workflow/run-start':
        return {
          ...state,
          runs: [...state.runs, {
            runId: event.data.runId,
            name: event.data.name,
            seq: event.seq,
            startedAt: event.time,
            interrupted: false,
            members: { started: 0, completed: 0, failed: 0, cancelled: 0 },
            turn: state.turn,
          }],
        }
      case 'tool-workflow/phase':
        return updateRun(state, event.data.runId, entry => ({ ...entry, currentPhase: event.data.title }))
      case 'tool-workflow/agent-start':
        return updateRun(state, event.data.runId, entry => ({
          ...entry,
          members: { ...entry.members, started: entry.members.started + 1 },
        }))
      case 'tool-workflow/agent-end':
        return updateRun(state, event.data.runId, entry => ({
          ...entry,
          members: { ...entry.members, [event.data.outcome]: entry.members[event.data.outcome] + 1 },
        }))
      case 'tool-workflow/run-end':
        return updateRun(state, event.data.runId, entry => ({
          ...entry,
          stopReason: event.data.stopReason,
          endedAt: event.time,
          interrupted: false,
        }))
      default:
        return state
    }
  },
  wire: {
    viewSchema: entriesSchema,
    view: state => state.runs,
    summary: false,
  },
} satisfies ProjectionDefinition<'workflowRuns', WorkflowRunsState>
