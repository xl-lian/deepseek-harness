/**
 * Host half of the science-agent loop UI: registers the fold that turns the
 * durable session log into loop rounds for the web client.
 *
 * @module @deepseek-ai/dsh-experimental-client-ui-science-loop
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import { scienceLoopProjection } from './projection/definition.ts'

/** Cordis plugin name. */
export const name = 'science-agent-loop-ui'

/** The projection registry mounted by dsh-base. */
export const inject = ['sessionProjections']

/**
 * Register the loop projection; unloading the plugin removes the key.
 * @param ctx - Cordis context of the science profile composition.
 * @returns when the projection is registered.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.sessionProjections.register(scienceLoopProjection)
}
