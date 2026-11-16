/**
 * Host half of the notebook UI: registers the folds that turn the durable
 * Session log into research runs, campaign rounds, paper runs, and activity
 * outside a loop for the web client.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-research-loop
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import { activityProjection } from './projection/activity.ts'
import { researchLoopProjection } from './projection/definition.ts'

/** Cordis plugin name. */
export const name = 'science-research-loop-ui'

/** The projection registry mounted by dsh-base. */
export const inject = ['sessionProjections']

/**
 * Register the notebook and activity projections; unloading the plugin removes both keys.
 * @param ctx - Cordis context of the research profile composition.
 * @returns when both projections are registered.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.sessionProjections.register(researchLoopProjection)
  await ctx.sessionProjections.register(activityProjection)
}
