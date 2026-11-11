/**
 * Function plugin registering the `workflowRuns` projection unit: a whole-log
 * outline of the Session's workflow runs for views that must cover runs
 * outside a client's paged event window. The plugin owns only the fold.
 *
 * @module @deepseek-ai/dsh-workflow-run-outline
 */

import type { Context } from '@deepseek-ai/cordis'
import { workflowRunsProjectionDefinition } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'workflow-run-outline'
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections']

/**
 * Register the `workflowRuns` unit; unloading the plugin removes the key.
 * @param ctx - registrant context carrying the projection registry.
 * @returns when the plugin is ready.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.sessionProjections.register(workflowRunsProjectionDefinition)
}
