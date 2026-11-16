import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { childSummary } from '../src/client/child.ts'
import { ChildSummaryView } from '../src/client/MemberChild.tsx'
import { en } from '../src/client/locales.ts'
import { MemberRow } from '../src/client/campaign-parts.tsx'

const t = ((key: string, params?: Record<string, string>) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value)
  return text
}) as TranslateNS<'researchLoop'>

let seq = 0
function next(): SessionSeq {
  seq += 1
  return seq as SessionSeq
}

function call(callId: string, name: string, args: string): SessionEventLikeEntry {
  return {
    type: 'event',
    event: { type: 'tool/call', seq: next(), time: seq, data: { turn: 1, step: 1, callId: callId as ToolCallId, name, arguments: args } },
  }
}

function result(callId: string, text: string, isError = false): SessionEventLikeEntry {
  return {
    type: 'event',
    event: {
      type: 'tool/result',
      seq: next(),
      time: seq,
      surfaceOp: 'append',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: `m-${callId}` as MessageId,
          role: 'tool',
          source: { kind: 'tool', callId: callId as ToolCallId },
          toolCallId: callId as ToolCallId,
          content: [{ type: 'text', text }],
          isError,
        },
      },
    },
  }
}

function say(text: string): SessionEventLikeEntry {
  return {
    type: 'event',
    event: {
      type: 'assistant/message',
      seq: next(),
      time: seq,
      surfaceOp: 'append',
      data: {
        turn: 1,
        step: 2,
        stream: [],
        message: { id: `m-${seq}` as MessageId, role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [{ type: 'text', text }] },
      },
    },
  }
}

describe('childSummary', () => {
  it('lists tool steps with their settled results and returns the structured output', () => {
    const summary = childSummary([
      say('Running the doctor check.'),
      call('c1', 'bash', '{"command":\n  "sagent doctor --json"}'),
      result('c1', '{"ok": true}'),
      call('c2', 'bash', '{"command":"sagent domain show"}'),
      result('c2', 'no domain', true),
      call('c3', 'read', '{"path":"a.md"}'),
      call('c4', 'structured_output', '{"ok":true,"data":{"checks":3}}'),
    ])
    expect(summary.steps.map(step => [step.name, step.status])).toEqual([['bash', 'ok'], ['bash', 'error'], ['read', 'running']])
    expect(summary.steps[0]?.argumentsLine).toBe('{"command": "sagent doctor --json"}')
    expect(summary.steps[1]?.result).toBe('no domain')
    expect(summary.result).toEqual({ kind: 'structured', text: '{\n  "ok": true,\n  "data": {\n    "checks": 3\n  }\n}' })
  })

  it('falls back to the last assistant text when the agent returns no structured output', () => {
    const summary = childSummary([say('First thought.'), say('Final answer: 42.')])
    expect(summary.steps).toEqual([])
    expect(summary.result).toEqual({ kind: 'message', text: 'Final answer: 42.' })
  })

  it('keeps non-JSON structured arguments as written', () => {
    expect(childSummary([call('c1', 'structured_output', 'not json')]).result).toEqual({ kind: 'structured', text: 'not json' })
  })
})

describe('ChildSummaryView', () => {
  it('renders the result and each step with its outcome', () => {
    const html = renderToStaticMarkup(
      <ChildSummaryView summary={childSummary([call('c1', 'bash', '{"command":"ls"}'), result('c1', 'a.txt'), call('c2', 'structured_output', '{"ok":true}')])} loading={false} t={t} />,
    )
    expect(html).toContain('Result')
    expect(html).toContain('&quot;ok&quot;: true')
    expect(html).toContain('Steps (1)')
    expect(html).toContain('data-status="ok"')
    expect(html).toContain('a.txt')
  })

  it('distinguishes loading from an empty child', () => {
    expect(renderToStaticMarkup(<ChildSummaryView summary={{ steps: [] }} loading t={t} />)).toContain('Loading the agent session')
    expect(renderToStaticMarkup(<ChildSummaryView summary={{ steps: [] }} loading={false} t={t} />)).toContain('has not recorded any steps')
  })
})

describe('MemberRow child expansion', () => {
  const member = { id: 'wf:1', label: 'doctor', role: 'sa-clerk', agent: 'sa-clerk', kind: 'workflow' as const, status: 'completed' as const, childId: 'child-1' }

  it('makes the head a collapsed toggle when the child can be retained', () => {
    const html = renderToStaticMarkup(
      <MemberRow member={member} openFile={() => {}} openSessionFor={() => {}} t={t} retainChild={() => { throw new Error('not retained while collapsed') }} />,
    )
    expect(html).toContain('class="rlc-member-head rlc-member-toggle"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('keeps a plain head without a retain callback', () => {
    const html = renderToStaticMarkup(<MemberRow member={member} openFile={() => {}} openSessionFor={() => {}} t={t} />)
    expect(html).not.toContain('rlc-member-toggle')
    expect(html).toContain('Open session')
  })
})
