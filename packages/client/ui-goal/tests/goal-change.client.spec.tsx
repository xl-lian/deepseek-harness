// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNodeDefinition, ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { commandDefinition } from '@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/command.ts'
import { chatViewDefinition } from '@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { GoalChangeCard, GoalChangeCardView } from '../src/client/GoalChangeCard.tsx'
import { GoalModeBadge, GoalModeChip } from '../src/client/GoalModeChip.tsx'
import { goalChangeCard, goalChangeDefinition, type GoalChangeCardData } from '../src/client/goal-change.ts'
import { goalCommandInputDefinition } from '../src/client/goal-command-input.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] {
    return [commandDefinition, goalCommandInputDefinition, goalChangeDefinition]
  }

  fallbackEntry(): undefined {
    return undefined
  }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] {
    return [chatViewDefinition]
  }
}

function entry(seq: number, type: string, data: unknown): SessionLiveEventEntry {
  return { type: 'event', event: { seq, time: 1_700_000_000_000 + seq, type, data } as SessionEvent }
}

function snapshot(entries: readonly SessionLiveEventEntry[]): ChatSnapshot {
  const assembler = new ConversationNodeAssembler(new TestEventDefinitions(), new TestViewDefinitions())
  assembler.replaceWindow(entries, false)
  assembler.activateTarget('chat')
  const value = assembler.snapshot('chat') as ChatSnapshot | undefined
  if (value === undefined) throw new Error('chat view was not registered')
  return value
}

function change(operation: string, goal: Record<string, unknown> = {}, roundsStarted = 0) {
  return {
    kind: 'goal/change', version: 1, operation, roundsStarted, createdAt: 1, updatedAt: 2,
    goal: { id: 'g1', revision: 1, objective: 'Ship the release', phase: 'active', maxGoalRounds: 8, ...goal },
  }
}

describe('goal change cards', () => {
  it('decodes create, complete, and block milestones and ignores every other change', () => {
    const at = (data: unknown) => ({ type: 'goal/change', data })
    expect(goalChangeCard(at(change('create')))).toEqual({
      operation: 'create', objective: 'Ship the release', roundsStarted: 0, maxGoalRounds: 8,
    })
    expect(goalChangeCard(at(change('complete', { phase: 'complete' }, 3)))).toEqual({
      operation: 'complete', objective: 'Ship the release', roundsStarted: 3, maxGoalRounds: 8,
    })
    expect(goalChangeCard(at(change('block', {
      phase: 'blocked', blockedReason: { code: 'round-limit', message: 'Reached 8 rounds.' },
    }, 8)))).toEqual({
      operation: 'block', objective: 'Ship the release', roundsStarted: 8, maxGoalRounds: 8, blockedReason: 'Reached 8 rounds.',
    })
    for (const operation of ['edit', 'pause', 'resume']) expect(goalChangeCard(at(change(operation)))).toBeUndefined()
    expect(goalChangeCard(at({ kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: 'g1', revision: 1 } })))
      .toBeUndefined()
    expect(goalChangeCard(at(change('create', { objective: 5 })))).toBeUndefined()
    expect(goalChangeCard(at({ ...change('create'), roundsStarted: -1 }))).toBeUndefined()
    expect(goalChangeCard(at(null))).toBeUndefined()
    expect(goalChangeCard({ type: 'command/done', data: change('create') })).toBeUndefined()
  })

  it('replaces the /goal creation text row with a card kept outside the folded Turn process', () => {
    const value = snapshot([
      entry(1, 'command/run', { commandId: 'c1', name: 'goal', args: ' Ship the release', source: { kind: 'user' } }),
      entry(2, 'goal/change', change('create')),
      entry(3, 'command/done', { commandId: 'c1', kind: 'success', text: 'Goal created', sourceEventSeq: 2 }),
      entry(4, 'goal/change', change('pause', { phase: 'paused' })),
    ])
    const visible = value.order.map(key => value.nodes.get(key))
    expect(visible.map(node => node?.kind)).toEqual(['command-input', 'goal-change'])
    expect(visible[1]).toMatchObject({ anchorSeq: 2, groupTree: 'turn', data: { operation: 'create' } })
  })

  it('keeps the first decoded state and builds nothing without a start Match', () => {
    const state: GoalChangeCardData = { operation: 'create', objective: 'x', roundsStarted: 0, maxGoalRounds: 8 }
    const later = { ...entry(9, 'goal/change', change('create')), role: 'update' as const, location: { kind: 'session' as const } }
    type UpdateContext = Parameters<typeof goalChangeDefinition.update>[0]
    expect(goalChangeDefinition.update({ state } as UpdateContext, later)).toBe(state)
    type BuildContext = Parameters<NonNullable<typeof goalChangeDefinition.buildViewNode>>[0]
    expect(goalChangeDefinition.buildViewNode?.({ state, start: undefined } as BuildContext)).toBeNull()
    expect(goalChangeDefinition.buildViewNode?.({ state: undefined, start: undefined } as BuildContext)).toBeNull()
  })

  it('renders the Chat node through the card view', () => {
    const data: GoalChangeCardData = { operation: 'complete', objective: 'Ship the release', roundsStarted: 2, maxGoalRounds: 8 }
    const t: Parameters<typeof GoalChangeCardView>[0]['t'] = makeTranslate(en, commonZh)
    const props = { node: { data }, t } as Parameters<typeof GoalChangeCard>[0]
    const view = render(<GoalChangeCard {...props} />)
    expect(view.getByRole('region', { name: 'Goal' }).textContent).toContain('Goal complete')
  })

  it.each([
    [en, 'create', 'Goal set', 'Continues automatically for up to 8 rounds'],
    [en, 'complete', 'Goal complete', 'Round 3/8'],
    [zh, 'block', '目标受阻', '第 8/8 轮'],
  ] as const)('renders the %s card title and round meta', (locale, operation, title, meta) => {
    const data: GoalChangeCardData = {
      operation,
      objective: 'Ship the release',
      roundsStarted: operation === 'create' ? 0 : operation === 'complete' ? 3 : 8,
      maxGoalRounds: 8,
      ...operation === 'block' ? { blockedReason: 'Reached 8 rounds.' } : {},
    }
    const t: Parameters<typeof GoalChangeCardView>[0]['t'] = makeTranslate(locale, commonZh)
    const view = render(<GoalChangeCardView data={data} t={t} />)
    const card = view.container.querySelector('[data-goal-change]')
    expect(card?.getAttribute('data-goal-change')).toBe(operation)
    expect(card?.textContent).toContain(title)
    expect(card?.textContent).toContain(meta)
    expect(card?.textContent).toContain('Ship the release')
    expect(card?.textContent?.includes('Reached 8 rounds.')).toBe(operation === 'block')
  })
})

describe('goal mode chip', () => {
  const t: Parameters<typeof GoalModeBadge>[0]['t'] = makeTranslate(en, commonZh)

  it('labels goal mode and explains automatic continuation in its tooltip', () => {
    render(<GoalModeBadge t={t} />)
    expect(screen.getByText('Goal mode').closest('[data-goal-mode]')?.getAttribute('title'))
      .toBe('A goal is active: the agent continues automatically, round by round, until it is complete or blocked')
  })

  it.each([
    ['active', true],
    ['paused', false],
    ['blocked', false],
    ['complete', false],
  ] as const)('a %s goal shows the chip: %s', (phase, shown) => {
    const projection = { goal: { phase } }
    const useProjection = (_key: string, selector: (value: typeof projection) => boolean) => selector(projection)
    const props = { useProjection, t } as Parameters<typeof GoalModeChip>[0]
    const view = render(<GoalModeChip {...props} />)
    expect(view.container.querySelector('[data-goal-mode]') !== null).toBe(shown)
  })
})
