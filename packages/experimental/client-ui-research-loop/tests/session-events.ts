/** Session event builders shared by the fold specs; each event gets the next sequence number and time. */

import type { SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session/types'

let seq = 0

/**
 * Build one committed Session event.
 * @param type - event type.
 * @param data - event payload.
 * @returns the event with the next sequence number.
 */
export function event(type: keyof SessionEventMap, data: object): SessionEvent {
  seq += 1
  return { type, seq, time: 1_000 + seq, data } as SessionEvent
}

/**
 * Build a `tool/call` event.
 * @param callId - tool call id.
 * @param name - tool name.
 * @param args - tool arguments, serialized as JSON.
 * @returns the event.
 */
export const call = (callId: string, name: string, args: object): SessionEvent =>
  event('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })

/**
 * Build a successful `tool/result` event.
 * @param callId - tool call id.
 * @param text - result text.
 * @returns the event.
 */
export const result = (callId: string, text: string): SessionEvent => event('tool/result', {
  turn: 1,
  step: 1,
  message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text }], isError: false },
})

/**
 * Member and narration event builders for one workflow run.
 * @param runId - workflow run id.
 * @returns `start`, `end`, and `log` builders.
 */
export function workflowEvents(runId: string): {
  readonly start: (memberSeq: number, label: string) => SessionEvent
  readonly end: (memberSeq: number, outcome?: string) => SessionEvent
  readonly log: (message: string) => SessionEvent
} {
  return {
    start: (memberSeq, label) => event('tool-workflow/agent-start', { runId, seq: memberSeq, label, childId: `child-${memberSeq}` }),
    end: (memberSeq, outcome = 'completed') => event('tool-workflow/agent-end', { runId, seq: memberSeq, outcome }),
    log: message => event('tool-workflow/log', { runId, message }),
  }
}

/**
 * JSON paths whose value is `undefined`; the wire and the persisted cache accept only lossless JSON.
 * @param value - any value.
 * @param path - path of `value`.
 * @returns each path holding `undefined`.
 */
export function undefinedPaths(value: unknown, path = '$'): string[] {
  if (value === undefined) return [path]
  if (Array.isArray(value)) return value.flatMap((item, index) => undefinedPaths(item, `${path}[${index}]`))
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`))
  return []
}
