/**
 * Small pure helpers shared by the research loop fold and the paper-writing
 * fold: bounded text and lists, JSON payload extraction from tool results, and
 * workflow tool-call matching.
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { ResearchStatus } from '../shared/schema.ts'

/** Longest list a fold keeps from one payload. */
export const MAX_LIST = 12
/** Clip length for sentences. */
export const TEXT = 400
/** Clip length for ids and titles. */
export const SHORT_TEXT = 160

/**
 * Whether a value is a plain JSON object.
 * @param value - any value.
 * @returns `true` for a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Clip text to a length, marking the cut.
 * @param text - the text.
 * @param limit - maximum length before the ellipsis.
 * @returns the text, or its first `limit` characters and an ellipsis.
 */
export function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

/**
 * A non-empty string, clipped.
 * @param value - any value.
 * @param limit - clip length.
 * @returns the clipped string, or `undefined` for anything else.
 */
export function str(value: unknown, limit = TEXT): string | undefined {
  return typeof value === 'string' && value.length > 0 ? clip(value, limit) : undefined
}

/**
 * A finite number.
 * @param value - any value.
 * @returns the number, or `undefined` for anything else.
 */
export function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * The strings of an array, bounded and clipped.
 * @param value - any value.
 * @param limit - maximum number of items.
 * @returns the string items, or an empty list for a non-array.
 */
export function strings(value: unknown, limit = MAX_LIST): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit).map(item => clip(item, SHORT_TEXT))
    : []
}

/**
 * Parse one JSON object.
 * @param text - JSON text.
 * @returns the object, or `undefined` when the text is not one JSON object.
 */
export function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    // Not one JSON document; callers fall back to scanning lines.
    return undefined
  }
}

/**
 * The text of a tool result.
 * @param content - result content blocks.
 * @returns the text blocks joined by newlines.
 */
export function textOf(content: readonly ContentBlock[]): string {
  return content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')
}

/**
 * Append to a list, dropping the oldest items beyond a limit.
 * @param list - the list.
 * @param item - the item to append.
 * @param limit - maximum length.
 * @returns the new list.
 */
export function pushBounded<T>(list: readonly T[], item: T, limit: number): T[] {
  const next = [...list, item]
  return next.length > limit ? next.slice(next.length - limit) : next
}

/**
 * Drop `undefined` properties, so the value stays lossless JSON.
 * @param value - an object.
 * @returns a copy without `undefined` properties.
 */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

/**
 * Member or run status for a workflow outcome.
 * @param outcome - `completed`, `cancelled`, or a failure reason.
 * @returns the settled status.
 */
export function settled(outcome: string): ResearchStatus {
  return outcome === 'completed' ? 'completed' : outcome === 'cancelled' ? 'cancelled' : 'failed'
}

/**
 * JSON payloads in a tool result: the workflow return value, one document, or a sagent envelope per line.
 * @param text - the tool result text.
 * @returns each payload object; a successful envelope contributes its `data`, a failed one nothing.
 */
export function payloadsOf(text: string): Record<string, unknown>[] {
  const marker = text.indexOf('Return value:')
  const body = marker === -1 ? text : text.slice(marker + 'Return value:'.length)
  const whole = parseObject(body.trim())
  const candidates = whole === undefined
    ? body.split('\n').map(line => parseObject(line.trim())).filter((value): value is Record<string, unknown> => value !== undefined)
    : [whole]
  return candidates.flatMap((value) => {
    if (value['ok'] === true) return isRecord(value['data']) ? [value['data']] : []
    return value['ok'] === false ? [] : [value]
  })
}


/**
 * Match a `workflow` tool call that launches one saved workflow.
 * @param name - tool name.
 * @param argumentsJson - tool arguments.
 * @param workflow - saved workflow name.
 * @returns the call's workspace argument when it launches `workflow`, else `undefined`.
 */
export function workflowCall(
  name: string,
  argumentsJson: string,
  workflow: string,
): { readonly workspace?: string | undefined } | undefined {
  if (name !== 'workflow' && name !== 'workflow_run') return undefined
  const args = parseObject(argumentsJson)
  if (args === undefined) return undefined
  const meta = isRecord(args['meta']) ? args['meta'] : undefined
  if (args['name'] !== workflow && meta?.['name'] !== workflow) return undefined
  const scriptArgs = isRecord(args['args']) ? args['args'] : parseObject(typeof args['args'] === 'string' ? args['args'] : '')
  return { workspace: str(scriptArgs?.['workspace']) }
}
