/**
 * Summary of one member's child Session for the Loop view's expanded member
 * row: the tool steps the agent took and its result. A structured `agent()`
 * member returns through its `structured_output` call; any other member's
 * result is its last assistant text.
 */

import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'

/** Tool a structured child calls to return its value; see `dsh-subagent` `STRUCTURED_OUTPUT_TOOL`. */
const STRUCTURED_OUTPUT_TOOL = 'structured_output'
const MAX_RESULT_CHARS = 8000
const MAX_STEP_CHARS = 2000
const MAX_ARGUMENT_CHARS = 160

/** One tool call made by the child agent. */
export interface ChildStep {
  readonly callId: string
  readonly name: string
  /** One-line, clipped argument text. */
  readonly argumentsLine: string
  readonly status: 'running' | 'ok' | 'error'
  /** Clipped tool result text, once settled. */
  readonly result?: string | undefined
}

/** What the child agent did and returned. */
export interface ChildSummary {
  readonly steps: readonly ChildStep[]
  /** Returned value: pretty JSON from `structured_output`, else the last assistant text. */
  readonly result?: { readonly kind: 'structured' | 'message'; readonly text: string } | undefined
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
}

function textOf(content: readonly ContentBlock[]): string {
  return content
    .map(block => block.type === 'text' ? block.text : '')
    .filter(text => text !== '')
    .join('\n')
    .trim()
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch (_notJson) {
    // The model's raw arguments are shown as written when they are not JSON.
    return text
  }
}

function argumentsLine(text: string): string {
  return clip(text.replace(/\s+/g, ' ').trim(), MAX_ARGUMENT_CHARS)
}

/**
 * Summarize a child Session event window.
 * @param entries - loaded window of the child Session's events.
 * @returns tool steps in call order and the child's result, when one is recorded.
 */
export function childSummary(entries: readonly SessionEventLikeEntry[]): ChildSummary {
  const steps = new Map<string, ChildStep>()
  let structured: string | undefined
  let message: string | undefined
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event
    switch (event.type) {
      case 'tool/call':
        if (event.data.name === STRUCTURED_OUTPUT_TOOL) {
          structured = event.data.arguments
          break
        }
        steps.set(event.data.callId, {
          callId: event.data.callId,
          name: event.data.name,
          argumentsLine: argumentsLine(event.data.arguments),
          status: 'running',
        })
        break
      case 'tool/result': {
        const step = steps.get(event.data.message.toolCallId)
        if (step === undefined) break
        steps.set(step.callId, {
          ...step,
          status: event.data.message.isError === true ? 'error' : 'ok',
          result: clip(textOf(event.data.message.content), MAX_STEP_CHARS),
        })
        break
      }
      case 'assistant/message': {
        const text = textOf(event.data.message.content)
        if (text !== '') message = text
        break
      }
      // SessionEvent is merge-extensible; other events add nothing to the summary.
      default:
        break
    }
  }
  const result = structured !== undefined
    ? { kind: 'structured' as const, text: clip(prettyJson(structured), MAX_RESULT_CHARS) }
    : message === undefined ? undefined : { kind: 'message' as const, text: clip(message, MAX_RESULT_CHARS) }
  return { steps: [...steps.values()], result }
}
