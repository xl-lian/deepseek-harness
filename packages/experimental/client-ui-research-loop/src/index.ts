/**
 * Host half of the research loop UI: registers the fold that turns the durable
 * Session log into research loop runs for the web client.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-research-loop
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import { researchLoopProjection } from './projection/definition.ts'

/** Cordis plugin name. */
export const name = 'science-research-loop-ui'

/** The projection registry mounted by dsh-base. */
export const inject = ['sessionProjections']

/**
 * Register the research loop projection; unloading the plugin removes the key.
 * @param ctx - Cordis context of the research profile composition.
 * @returns when the projection is registered.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.sessionProjections.register(researchLoopProjection)
}
