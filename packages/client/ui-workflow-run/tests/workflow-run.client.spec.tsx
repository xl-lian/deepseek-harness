// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConversationNodeAssembler, UiConversation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ConversationMatch, ConversationNodeDefinition, ConversationStartMatch,
  ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {
  SessionListState, SessionLiveEventEntry,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import {
  allowAllAccess, chatSnapshot as emptyChatSnapshot, conversationSnapshot, makeTranslate, sessionSnapshot,
  stubConfigForm, TestSessions, workspaceSnapshot,
} from '@deepseek-ai/dsh-client-test-runtime'
import {
  WorkflowRunPanel, type WorkflowRunInjected, type WorkflowRunPanelProps,
} from '../src/client/WorkflowRunPanel.tsx'
import { apply, inject } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import {
  workflowRunDefinition, type WorkflowRunChatData,
} from '../src/client/workflow-definition.ts'
import { apply as applyNode } from '../src/index.ts'
import type {} from '../src/client/index.ts'

// Every session-scope fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)


const PARENT_ID = 'parent' as SessionId
const CHILD_ID = 'child-1' as SessionId
const SECOND_ID = 'child-2' as SessionId

type TrajectoryState = Parameters<Parameters<WorkflowRunPanelProps['useTrajectory']>[0]>[0]

const panelSession = sessionSnapshot(PARENT_ID)
const panelAttention = new Map<SessionId, never>()
const panelWorkspace = workspaceSnapshot()
const panelConversation = conversationSnapshot()
const panelChat = emptyChatSnapshot()
const panelTrajectory: TrajectoryState = {
  eventNodes: [],
  eventLocations: new Map(),
  requests: [],
  callSchemas: new Map(),
  partial: null,
  runningCalls: [],
}

interface ChatSnapshot {
  readonly nodes: ReadonlyMap<string, ChatConversationViewNode>
}

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] { return [workflowRunDefinition] }
  fallbackEntry(): undefined { return undefined }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] { return [chatViewDefinition] }
}

const chatViewDefinition: ConversationViewDefinition<ChatConversationViewNode, ChatSnapshot> = {
  target: 'chat',
  create: () => {
    let nodes = new Map<string, ChatConversationViewNode>()
    const snapshot = (): ChatSnapshot => ({ nodes })
    return {
      empty: snapshot(),
      replace: ({ nodes: values }) => {
        nodes = new Map(values.map(node => [node.key, node]))
        return snapshot()
      },
      apply: ({ upserts }) => {
        nodes = new Map(nodes)
        for (const node of upserts) nodes.set(node.key, node)
        return snapshot()
      },
    }
  },
}

function at(seq: number, type: string, data: unknown): SessionLiveEventEntry {
  return { type: 'event', event: { seq, time: seq * 100, type, data } as SessionEvent }
}

function matched(input: SessionLiveEventEntry, role: 'start'): ConversationStartMatch
function matched(input: SessionLiveEventEntry, role: 'update'): ConversationMatch
function matched(input: SessionLiveEventEntry, role: ConversationMatch['role']): ConversationMatch {
  return { event: input.event, role, location: { kind: 'unresolved' } }
}

function assembler(entries: readonly SessionLiveEventEntry[], hasMore = false): ConversationNodeAssembler {
  const value = new ConversationNodeAssembler(new TestEventDefinitions(), new TestViewDefinitions())
  value.replaceWindow(entries, hasMore)
  value.activateTarget('chat')
  return value
}

function workflowData(value: ConversationNodeAssembler): WorkflowRunChatData | undefined {
  const snapshot = value.snapshot('chat') as ChatSnapshot
  return [...snapshot.nodes.values()][0]?.data as WorkflowRunChatData | undefined
}

function completeEvents(): SessionLiveEventEntry[] {
  return [
    at(1, 'turn/start', { turn: 1 }),
    at(2, 'step/start', { turn: 1, step: 1 }),
    at(3, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
    at(4, 'tool-workflow/agent-start', {
      runId: 'run-1', seq: 1, label: 'first', phase: '', childId: 'child-1',
    }),
    at(5, 'tool-workflow/agent-start', {
      runId: 'run-1', seq: 2, label: 'second', childId: 'child-2',
    }),
    at(6, 'tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }),
    at(7, 'tool-workflow/agent-end', { runId: 'run-1', seq: 2, outcome: 'failed' }),
    at(8, 'tool-workflow/run-end', { runId: 'run-1', stopReason: 'error' }),
    at(9, 'step/end', { turn: 1, step: 1 }),
    at(10, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ]
}

describe('workflow-run Conversation Definition', () => {
  it('groups exact phase identities in first-member order and preserves terminal members', () => {
    const value = assembler(completeEvents())
    const data = workflowData(value)
    expect(data).toEqual({
      name: 'audit',
      status: 'failed',
      phases: [
        {
          key: 'value:0:', phase: '',
          members: [{ seq: 1, label: 'first', childId: 'child-1', status: 'completed', startedAt: 400, endedAt: 600 }],
        },
        {
          key: 'missing', phase: null,
          members: [{ seq: 2, label: 'second', childId: 'child-2', status: 'failed', startedAt: 500, endedAt: 700 }],
        },
      ],
      startedAt: 300,
      endedAt: 800,
      activity: [],
      metrics: [],
      progressEventsDropped: 0,
    })
    const node = [...(value.snapshot('chat') as ChatSnapshot).nodes.values()][0]!
    expect(node.anchorSeq).toBe(3)
    expect(node.kind).toBe('workflow-run')
  })

  it('folds phase and log records, timing, and the dropped count', () => {
    const data = workflowData(assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'step/start', { turn: 1, step: 1 }),
      at(3, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      at(4, 'tool-workflow/phase', { runId: 'run-1', title: 'Scan' }),
      at(5, 'tool-workflow/log', { runId: 'run-1', message: '3/10' }),
      at(6, 'tool-workflow/phase', { runId: 'run-1', title: 'Verify' }),
      at(7, 'tool-workflow/log', { runId: 'run-1', message: 'done' }),
      at(8, 'tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed', progressEventsDropped: 4 }),
    ]))
    expect(data).toMatchObject({
      currentPhase: 'Verify',
      startedAt: 300,
      endedAt: 800,
      progressEventsDropped: 4,
      activity: [
        { seq: 4, kind: 'phase', text: 'Scan' },
        { seq: 5, kind: 'log', text: '3/10' },
        { seq: 6, kind: 'phase', text: 'Verify' },
        { seq: 7, kind: 'log', text: 'done' },
      ],
    })
  })

  it('folds metrics into latest, min, and max per name in first-recorded order', () => {
    const data = workflowData(assembler([
      at(3, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      at(4, 'tool-workflow/metric', { runId: 'run-1', name: 'loss', value: 2 }),
      at(5, 'tool-workflow/metric', { runId: 'run-1', name: 'acc', value: 0.5 }),
      at(6, 'tool-workflow/metric', { runId: 'run-1', name: 'loss', value: 1, step: 1 }),
      at(7, 'tool-workflow/metric', { runId: 'run-1', name: 'loss', value: 3, step: 2 }),
    ]))
    expect(data?.metrics).toEqual([
      { name: 'loss', latest: 3, min: 1, max: 3 },
      { name: 'acc', latest: 0.5, min: 0.5, max: 0.5 },
    ])
  })

  it('leaves the current phase absent when no phase was recorded', () => {
    const data = workflowData(assembler([
      at(3, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      at(4, 'tool-workflow/log', { runId: 'run-1', message: 'only a log' }),
    ]))
    expect(data).not.toHaveProperty('currentPhase')
  })

  it('keeps an update-only tail pending until prepend supplies the unique start', () => {
    const tail = completeEvents().slice(3)
    const value = assembler(tail, true)
    expect(workflowData(value)).toBeUndefined()
    value.prepend(completeEvents().slice(0, 3), false)
    value.flush()
    expect(workflowData(value)).toEqual(workflowData(assembler(completeEvents())))
  })

  it('produces the same final data through live append as complete replay', () => {
    const events = completeEvents()
    const value = assembler(events.slice(0, 3))
    for (const event of events.slice(3)) value.append(event)
    value.flush()
    expect(workflowData(value)).toEqual(workflowData(assembler(events)))
  })

  it('keeps a background run running after its Tool Step and Turn end normally', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'step/start', { turn: 1, step: 1 }),
      at(3, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
      at(4, 'step/end', { turn: 1, step: 1 }),
      at(5, 'turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }),
      at(6, 'tool-workflow/agent-start', {
        runId: 'run-1', seq: 1, label: 'worker', childId: 'child-1',
      }),
    ])
    expect(workflowData(value)).toMatchObject({
      status: 'running',
      phases: [{ members: [{ status: 'running' }] }],
    })
    value.append(at(7, 'tool-workflow/agent-end', { runId: 'run-1', seq: 1, outcome: 'completed' }))
    value.append(at(8, 'tool-workflow/run-end', { runId: 'run-1', stopReason: 'completed' }))
    value.flush()
    expect(workflowData(value)?.status).toBe('completed')
  })

  it.each(['interrupted', 'forked'] as const)(
    'shows missing terminal facts as interrupted once a %s closer ends the owning Turn',
    (kind) => {
      const value = assembler([
        at(1, 'turn/start', { turn: 1 }),
        at(2, 'step/start', { turn: 1, step: 1 }),
        at(3, 'tool-workflow/run-start', { runId: 'run-1', name: 'audit' }),
        at(4, 'tool-workflow/agent-start', {
          runId: 'run-1', seq: 1, label: 'worker', childId: 'child-1',
        }),
      ])
      expect(workflowData(value)?.status).toBe('running')
      value.append(at(5, 'turn/end', { turn: 1, reason: { kind } }))
      value.flush()
      expect(workflowData(value)).toMatchObject({
        status: 'interrupted',
        phases: [{ members: [{ status: 'interrupted' }] }],
      })
    },
  )

  it('retains a zero-member run as its own completed node', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'step/start', { turn: 1, step: 1 }),
      at(3, 'tool-workflow/run-start', { runId: 'empty', name: 'empty' }),
      at(4, 'tool-workflow/run-end', { runId: 'empty', stopReason: 'completed' }),
    ])
    expect(workflowData(value)).toEqual({
      name: 'empty', status: 'completed', phases: [], activity: [], metrics: [], progressEventsDropped: 0,
      startedAt: 300, endedAt: 400,
    })
  })

  it('folds same-phase cancellation and a turn-level interruption', () => {
    const cancelled = assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'tool-workflow/run-start', { runId: 'cancelled', name: 'cancelled' }),
      at(3, 'tool-workflow/agent-start', {
        runId: 'cancelled', seq: 1, label: 'one', phase: 'Research', childId: 'child-1',
      }),
      at(4, 'tool-workflow/agent-start', {
        runId: 'cancelled', seq: 2, label: 'two', phase: 'Research', childId: 'child-2',
      }),
      at(5, 'tool-workflow/agent-end', { runId: 'cancelled', seq: 1, outcome: 'cancelled' }),
      at(6, 'tool-workflow/agent-end', { runId: 'cancelled', seq: 2, outcome: 'completed' }),
      at(7, 'tool-workflow/run-end', { runId: 'cancelled', stopReason: 'cancelled' }),
    ])
    expect(workflowData(cancelled)).toMatchObject({
      status: 'cancelled',
      phases: [{ phase: 'Research', members: [{ status: 'cancelled' }, { status: 'completed' }] }],
    })

    const interruptedTurn = assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'tool-workflow/run-start', { runId: 'turn', name: 'turn' }),
      at(3, 'tool-workflow/agent-start', {
        runId: 'turn', seq: 1, label: 'open', childId: 'child-1',
      }),
      at(4, 'turn/end', { turn: 1, reason: { kind: 'interrupted' } }),
    ])
    expect(workflowData(interruptedTurn)?.status).toBe('interrupted')
  })

  it('handles session/unresolved placement and defensive Definition calls', () => {
    const sessionLevel = assembler([
      at(1, 'tool-workflow/run-start', { runId: 'session', name: 'session' }),
      at(2, 'tool-workflow/agent-start', {
        runId: 'session', seq: 1, label: 'open', childId: 'child-1',
      }),
    ])
    expect(workflowData(sessionLevel)?.status).toBe('running')

    const invalidStart = matched(at(1, 'tool-workflow/agent-start', {
      runId: 'direct', seq: 1, label: 'member', childId: 'child-1',
    }), 'start')
    const emptyContext: Parameters<typeof workflowRunDefinition.start>[0] = {
      key: 'workflow-run:direct', kind: 'workflow-run', id: 'direct',
      matches: [invalidStart], start: invalidStart, state: undefined, current: new Map(),
    }
    const reader: Parameters<typeof workflowRunDefinition.start>[2] = { previous: () => undefined }
    expect(() => workflowRunDefinition.start(emptyContext, invalidStart, reader))
      .toThrow('workflow-run start requires tool-workflow/run-start')

    const start = matched(at(2, 'tool-workflow/run-start', { runId: 'direct', name: 'direct' }), 'start')
    const startedContext = { ...emptyContext, matches: [start], start }
    const state = workflowRunDefinition.start(startedContext, start, reader)
    const updateContext: Parameters<typeof workflowRunDefinition.update>[0] = { ...startedContext, state }
    const unrelated = matched(at(3, 'turn/start', { turn: 1 }), 'update')
    expect(workflowRunDefinition.update(updateContext, unrelated)).toBe(state)
    expect(workflowRunDefinition.target).toBe('chat')
    expect(workflowRunDefinition.buildViewNode?.({
      ...updateContext, matches: [], start: undefined,
    })).toBeNull()
    const directNode = workflowRunDefinition.buildViewNode?.(updateContext) as ChatConversationViewNode | null | undefined
    if (directNode === null) throw new Error('expected direct workflow Chat node')
    if (directNode === undefined) throw new Error('expected workflow Chat view builder')
    expect(directNode.kind).toBe('workflow-run')
    expect((directNode.data as WorkflowRunChatData).status).toBe('running')
  })
})

type RunMember = WorkflowRunChatData['phases'][number]['members'][number]
type TestMember = Omit<RunMember, 'startedAt'> & Partial<Pick<RunMember, 'startedAt'>>
type TestPhase = Omit<WorkflowRunChatData['phases'][number], 'members'> & { readonly members: readonly TestMember[] }
type TestRunData = Pick<WorkflowRunChatData, 'name' | 'status'>
  & Partial<Pick<WorkflowRunChatData, 'startedAt' | 'endedAt' | 'currentPhase' | 'activity' | 'metrics' | 'progressEventsDropped'>>
  & { readonly phases: readonly TestPhase[] }

function completeData(data: TestRunData): WorkflowRunChatData {
  return {
    activity: [],
    metrics: [],
    progressEventsDropped: 0,
    startedAt: 0,
    ...data,
    phases: data.phases.map(entry => ({
      ...entry,
      members: entry.members.map(member => ({ startedAt: 0, ...member })),
    })),
  }
}

function node(data: TestRunData): WorkflowRunPanelProps['node'] {
  return {
    key: '12:workflow-runrun-1',
    kind: 'workflow-run',
    id: 'run-1',
    target: 'chat',
    anchorSeq: 3,
    location: { kind: 'unresolved' },
    visibility: 'visible',
    data: completeData(data),
  }
}

const phase = (overrides: Partial<TestPhase> = {}): TestPhase => ({
  key: 'missing',
  phase: null,
  members: [{ seq: 1, label: 'worker', childId: 'child-1' as SessionId, status: 'running' }],
  ...overrides,
})

const listState = (overrides: Partial<SessionListState> = {}): SessionListState => ({
  ids: [PARENT_ID, CHILD_ID],
  byId: {
    [PARENT_ID]: {
      id: PARENT_ID, displayTitle: 'parent', running: true, retainedBy: {}, blank: false, updatedAt: 0,
    },
    [CHILD_ID]: {
      id: CHILD_ID, displayTitle: 'child', parentId: PARENT_ID, origin: 'subagent',
      running: true, retainedBy: {}, blank: false, updatedAt: 0,
    },
  },
  phase: 'ready',
  projectionsBySession: { [CHILD_ID]: { state: 'ready', error: null, values: {
    subagent: { mode: 'one-shot', seq: SessionSeq(0) },
  } } },
  ...overrides,
})

function panelProps(data: TestRunData, sessions = listState(), openSession = vi.fn()): WorkflowRunPanelProps {
  return {
    node: node(data),
    sessionId: PARENT_ID,
    useSessions: selector => selector(sessions),
    usePanelInfo, useResource,
    useSessionStatus: selector => selector(panelAttention),
    useSessionRetainInfo: () => undefined,
    useSession: selector => selector(panelSession),
    useProjection: () => undefined,
    useConversation: selector => selector(panelConversation),
    useChat: selector => selector(panelChat),
    useTrajectory: selector => selector(panelTrajectory),
    useInput: () => { throw new Error('unused') },
    inputActions: {
      insertQuote: () => false,
      captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }),
      insertText: () => false,
      setDraft: () => {},
      persistDraft: () => {},
      addAttachments: () => false,
      removeAttachment: () => {},
      pruneAttachments: () => {},
      submit: () => {},
    },
    useWorkspaces: selector => selector(panelWorkspace),
    ...allowAllAccess,
    useTurnData: () => undefined,
    useDisclosure: () => { throw new Error('unused') },
    useGroupAction: () => { throw new Error('unused') },
    openFile: () => {},
    inspectCall: () => {},
    forkAt: () => {},
    loadImage: () => Promise.reject(new Error('not used')),
    fileMentions: () => undefined,
    openSession,
    openRuns: vi.fn(),
    t: makeTranslate(zh),
  }
}

describe('WorkflowRunPanel', () => {
  describe('progress display', () => {
    afterEach(() => { vi.useRealTimers() })
    const settled = (member: Partial<TestMember> = {}): TestMember => ({
      seq: 1, label: 'worker', childId: CHILD_ID, status: 'completed', startedAt: 1_000, endedAt: 66_000, ...member,
    })

    it('shows the current phase, counts, and recorded durations for a settled run', () => {
      const { container } = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'completed', startedAt: 0, endedAt: 3_725_000, currentPhase: 'Verify',
        phases: [phase({ phase: 'Scan', key: 'scan', members: [settled()] })],
      })} />)
      expect(container.querySelector('[data-run-summary]')?.textContent).toBe('Verify · 已完成 1 · 1 个成员')
      expect(container.querySelector('[data-run-duration]')?.textContent).toBe('1小时2分')
      fireEvent.click(screen.getByRole('button', { name: /audit/ }))
      expect(container.querySelector('[data-phase-duration]')?.textContent).toBe('1分5秒')
    })

    it('ticks while live, stops at settlement, and shows seconds', () => {
      vi.useFakeTimers({ now: 10_000 })
      const running: TestRunData = {
        name: 'audit', status: 'running', startedAt: 8_000,
        phases: [phase({ members: [{ seq: 1, label: 'worker', childId: CHILD_ID, status: 'running', startedAt: 9_000 }] })],
      }
      const { container, rerender } = render(<WorkflowRunPanel {...panelProps(running)} />)
      const duration = (): string | null | undefined => container.querySelector('[data-run-duration]')?.textContent
      expect(duration()).toBe('2秒')
      expect(container.querySelector('[data-member-duration]')?.textContent).toBe('1秒')
      act(() => { vi.advanceTimersByTime(3_000) })
      expect(duration()).toBe('5秒')
      rerender(<WorkflowRunPanel {...panelProps({ ...running, status: 'completed', endedAt: 20_000 })} />)
      act(() => { vi.advanceTimersByTime(60_000) })
      expect(duration()).toBe('12秒')
    })

    it('shows no duration for an interrupted span without a recorded end', () => {
      const { container } = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'interrupted', startedAt: 0,
        phases: [phase({ members: [{ seq: 1, label: 'worker', childId: CHILD_ID, status: 'interrupted', startedAt: 0 }] })],
      })} />)
      expect(container.querySelector('[data-run-duration]')).toBeNull()
      expect(container.querySelector('[data-phase-duration]')).toBeNull()
      expect(container.querySelector('[data-member-duration]')).toBeNull()
    })

    it('discloses recorded activity and the dropped count on demand', () => {
      const { container } = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000, progressEventsDropped: 2,
        activity: [{ seq: 4, kind: 'phase', text: 'Scan' }, { seq: 5, kind: 'log', text: '3/10' }],
        phases: [],
      })} />)
      expect(screen.queryByText('3/10')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /活动/ }))
      expect(screen.getByText('3/10').getAttribute('data-activity-kind')).toBe('log')
      expect(screen.getByText('Scan').getAttribute('data-activity-kind')).toBe('phase')
      expect(screen.getByText('另有 2 条进度未记录')).toBeTruthy()
      expect(container.querySelector('[data-workflow-activity]')).not.toBeNull()
    })

    it('discloses activity without a notice when nothing was dropped', () => {
      render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000,
        activity: [{ seq: 4, kind: 'log', text: 'only' }], phases: [],
      })} />)
      fireEvent.click(screen.getByRole('button', { name: /活动/ }))
      expect(screen.getByText('only')).toBeTruthy()
      expect(screen.queryByText(/未记录/)).toBeNull()
    })

    it('shows a metrics table only when metrics exist, with exact values in titles', () => {
      const { container } = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000, phases: [],
        metrics: [{ name: 'loss', latest: 0.123456789, min: 0.1, max: 2 }],
      })} />)
      const cell = screen.getByText('0.123457')
      expect(cell.getAttribute('title')).toBe('0.123456789')
      expect(container.querySelector('[data-workflow-metrics]')).not.toBeNull()
      cleanup()
      const none = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000, phases: [],
      })} />)
      expect(none.container.querySelector('[data-workflow-metrics]')).toBeNull()
    })

    it('opens the Runs tab from the expanded run', () => {
      const props = panelProps({ name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000, phases: [] })
      render(<WorkflowRunPanel {...props} />)
      fireEvent.click(screen.getByRole('button', { name: '比较运行' }))
      expect(props.openRuns).toHaveBeenCalledOnce()
    })

    it('shows a dropped-only notice and hides the section with no progress', () => {
      const dropped = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000, progressEventsDropped: 1, phases: [],
      })} />)
      expect(dropped.container.querySelector('[data-workflow-activity]')).not.toBeNull()
      dropped.unmount()
      const empty = render(<WorkflowRunPanel {...panelProps({
        name: 'audit', status: 'failed', startedAt: 0, endedAt: 1_000, phases: [],
      })} />)
      expect(empty.container.querySelector('[data-workflow-activity]')).toBeNull()
    })
  })

  it('keeps live run and phase controls manual across ordinary updates and outer hiding', () => {
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase({ key: 'research', phase: 'Research' })],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    const runHeader = screen.getByRole('button', { name: /^audit/ })
    const phaseHeader = screen.getByRole('button', { name: /Research/ })
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('worker')).toBeTruthy()

    fireEvent.click(phaseHeader)
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('worker')).toBeNull()
    fireEvent.click(runHeader)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')

    view.rerender(<WorkflowRunPanel {...panelProps({
      ...running,
      phases: [phase({
        key: 'research', phase: 'Research',
        members: [
          { seq: 1, label: 'worker', childId: CHILD_ID, status: 'running' },
          { seq: 2, label: 'second', childId: 'child-2' as SessionId, status: 'running' },
        ],
      })],
    })} />)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /Research/ })).toBeNull()
    fireEvent.keyDown(runHeader, { key: 'ArrowDown' })
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(runHeader, { key: ' ' })
    const updatedPhase = screen.getByRole('button', { name: /Research/ })
    expect(updatedPhase.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('运行中 2')).toBeTruthy()
    fireEvent.keyDown(updatedPhase, { key: 'Enter' })
    expect(screen.getByText('worker')).toBeTruthy()
    expect(screen.getByText('second')).toBeTruthy()

    fireEvent.click(runHeader)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /Research/ })).toBeNull()
    fireEvent.keyDown(runHeader, { key: ' ' })
    expect(screen.getByRole('button', { name: /Research/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('folds each normal completion once and opens a new same-key activity cycle', () => {
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    const runningPhase = screen.getByRole('button', { name: /未分阶段/ })
    fireEvent.click(runningPhase)
    fireEvent.keyDown(runningPhase, { key: 'Enter' })
    expect(screen.getByText('worker')).toBeTruthy()

    const phaseCompleted: TestRunData = {
      ...running,
      phases: [phase({
        members: [{
          seq: 1, label: 'done', childId: 'child-1' as SessionId, status: 'completed',
        }],
      })],
    }
    view.rerender(<WorkflowRunPanel {...panelProps(phaseCompleted)} />)
    const phaseHeader = screen.getByRole('button', { name: /未分阶段/ })
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('done')).toBeNull()
    fireEvent.click(phaseHeader)
    expect(screen.getByText('done')).toBeTruthy()

    const cleanUpdate: TestRunData = {
      ...phaseCompleted,
      phases: [phase({
        members: [{
          seq: 1, label: 'reviewed', childId: 'child-1' as SessionId, status: 'completed',
        }],
      })],
    }
    view.rerender(<WorkflowRunPanel {...panelProps(cleanUpdate)} />)
    expect(screen.getByText('reviewed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /未分阶段/ }))
    const runHeader = screen.getByRole('button', { name: /^audit/ })
    fireEvent.click(runHeader)
    const renewed: TestRunData = {
      name: 'audit', status: 'running',
      phases: [phase({
        members: [
          { seq: 1, label: 'reviewed', childId: CHILD_ID, status: 'completed' },
          { seq: 2, label: 'new', childId: 'child-2' as SessionId, status: 'running' },
        ],
      })],
    }
    view.rerender(<WorkflowRunPanel {...panelProps(renewed)} />)
    expect(screen.getByRole('button', { name: /^audit/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('new')).toBeTruthy()

    const renewedPhaseCompleted: TestRunData = {
      ...renewed,
      phases: [phase({
        members: [
          { seq: 1, label: 'reviewed', childId: CHILD_ID, status: 'completed' },
          { seq: 2, label: 'new', childId: 'child-2' as SessionId, status: 'completed' },
        ],
      })],
    }
    view.rerender(<WorkflowRunPanel {...panelProps(renewedPhaseCompleted)} />)
    expect(screen.getByRole('button', { name: /^audit/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /未分阶段/ }))

    view.rerender(<WorkflowRunPanel {...panelProps({
      ...renewedPhaseCompleted,
      status: 'completed',
    })} />)
    expect(screen.getByRole('button', { name: /^audit/ }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /^audit/ }))
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('refolds a phase when a complete activity cycle arrives as one clean update', () => {
    const firstMember = {
      seq: 1, label: 'first', childId: 'child-1' as SessionId, status: 'completed' as const,
    }
    const phaseClean: TestRunData = {
      name: 'phase-cycle', status: 'running',
      phases: [phase({ members: [firstMember] })],
    }
    const phaseView = render(<WorkflowRunPanel {...panelProps(phaseClean)} />)
    fireEvent.click(screen.getByRole('button', { name: /未分阶段/ }))
    expect(screen.getByText('first')).toBeTruthy()
    const runHeader = screen.getByRole('button', { name: /^phase-cycle/ })
    fireEvent.click(runHeader)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    phaseView.rerender(<WorkflowRunPanel {...panelProps({
      ...phaseClean,
      phases: [phase({ members: [firstMember, {
        seq: 2, label: 'second', childId: 'child-2' as SessionId, status: 'completed',
      }] })],
    })} />)
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('first')).toBeNull()
    expect(screen.queryByText('second')).toBeNull()

    phaseView.rerender(<WorkflowRunPanel {...panelProps({
      ...phaseClean,
      status: 'completed',
      phases: [phase({ members: [firstMember, {
        seq: 2, label: 'second', childId: SECOND_ID, status: 'completed',
      }, {
        seq: 3, label: 'final', childId: 'child-3' as SessionId, status: 'completed',
      }] })],
    })} />)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /未分阶段/ })).toBeNull()
  })

  it('initializes a newly observed phase before it becomes interactive', () => {
    const running: TestRunData = {
      name: 'dynamic-phase', status: 'running',
      phases: [phase({ key: 'research', phase: 'Research' })],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    view.rerender(<WorkflowRunPanel {...panelProps({
      ...running,
      phases: [
        ...running.phases,
        phase({
          key: 'build', phase: 'Build',
          members: [{ seq: 2, label: 'builder', childId: SECOND_ID, status: 'running' }],
        }),
      ],
    })} />)
    const build = screen.getByRole('button', { name: /Build/ })
    expect(build.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(build)
    expect(build.getAttribute('aria-expanded')).toBe('false')
  })

  it('derives the zero-member running and completed states from the current run status', () => {
    const running: TestRunData = { name: 'empty', status: 'running', phases: [] }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    expect(screen.getByRole('button', { name: /^empty/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('没有启动成员')).toBeTruthy()
    view.rerender(<WorkflowRunPanel {...panelProps({ ...running, status: 'completed' })} />)
    const header = screen.getByRole('button', { name: /^empty/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('没有启动成员')).toBeNull()
    fireEvent.click(header)
    expect(screen.getByText('没有启动成员')).toBeTruthy()
  })

  it.each(['failed', 'cancelled', 'interrupted'] as const)(
    'initializes %s attention as an expanded disclosure that remains manually collapsible',
    (status) => {
      render(<WorkflowRunPanel {...panelProps({
        name: 'member-outcome', status,
        phases: [phase({
          members: [{ seq: 1, label: status, childId: CHILD_ID, status }],
        })],
      })} />)
      const runHeader = screen.getByRole('button', { name: /^member-outcome/ })
      const phaseHeader = screen.getByRole('button', { name: /未分阶段/ })
      expect(runHeader.getAttribute('aria-expanded')).toBe('true')
      expect(phaseHeader.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByText(status)).toBeTruthy()
      fireEvent.click(phaseHeader)
      fireEvent.click(runHeader)
      expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    },
  )

  it('opens the first abnormal edge once and preserves later abnormal choices', () => {
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    fireEvent.click(screen.getByRole('button', { name: /未分阶段/ }))
    fireEvent.click(screen.getByRole('button', { name: /^audit/ }))

    const failed: TestRunData = {
      name: 'audit', status: 'running',
      phases: [phase({
        members: [{ seq: 1, label: 'failed', childId: CHILD_ID, status: 'failed' }],
      })],
    }
    view.rerender(<WorkflowRunPanel {...panelProps(failed)} />)
    expect(screen.getByRole('button', { name: /^audit/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /未分阶段/ }))
    fireEvent.click(screen.getByRole('button', { name: /^audit/ }))

    view.rerender(<WorkflowRunPanel {...panelProps({
      ...failed,
      phases: [phase({
        members: [
          { seq: 1, label: 'failed', childId: CHILD_ID, status: 'failed' },
          { seq: 2, label: 'cancelled', childId: 'child-2' as SessionId, status: 'cancelled' },
        ],
      })],
    })} />)
    expect(screen.getByRole('button', { name: /^audit/ }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /^audit/ }))
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('失败 1 · 已取消 1')).toBeTruthy()
  })

  it('keeps clean sibling phases independent and preserves empty versus absent names', () => {
    render(<WorkflowRunPanel {...panelProps({
      name: 'audit', status: 'completed',
      phases: [
        phase({ key: 'value:0:', phase: '', members: [{
          seq: 1, label: '', childId: 'child-1' as SessionId, status: 'completed',
        }] }),
        phase({ key: 'missing', phase: null, members: [{
          seq: 2, label: 'second', childId: 'child-2' as SessionId, status: 'running',
        }] }),
      ],
    })} />)
    const runHeader = screen.getByRole('button', { name: /^audit/ })
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    const cleanPhase = screen.getByRole('button', { name: /空阶段名/ })
    expect(cleanPhase.getAttribute('aria-expanded')).toBe('false')
    const activePhase = screen.getByRole('button', { name: /未分阶段/ })
    expect(activePhase.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByText('空成员名')).toBeNull()
    expect(screen.getByText('second')).toBeTruthy()
    fireEvent.click(cleanPhase)
    expect(screen.getByText('空成员名')).toBeTruthy()
    expect(screen.getByText('second')).toBeTruthy()
    fireEvent.click(activePhase)
    expect(screen.queryByText('second')).toBeNull()
    expect(screen.getByText('空成员名')).toBeTruthy()
    fireEvent.click(runHeader)
    fireEvent.click(runHeader)
    expect(screen.getByRole('button', { name: /空阶段名/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /空阶段名/ }))
    expect(screen.queryByText('空成员名')).toBeNull()
  })

  it('renders mixed and interrupted aggregate status while attention stays visible', () => {
    const mixed: TestRunData = {
      name: 'repo-audit', status: 'failed',
      phases: [phase({
        members: [
          { seq: 1, label: 'failed', childId: 'child-1' as SessionId, status: 'failed' },
          { seq: 2, label: 'cancelled', childId: 'child-2' as SessionId, status: 'cancelled' },
        ],
      })],
    }
    const mixedView = render(<WorkflowRunPanel {...panelProps(mixed)} />)
    expect(screen.getByText('失败 1 · 已取消 1')).toBeTruthy()
    expect([...mixedView.container.querySelectorAll('[data-member-status]')]
      .map(row => row.getAttribute('data-member-status'))).toEqual(['failed', 'cancelled'])
    expect(mixedView.container.querySelectorAll('[data-state="error"]')).toHaveLength(2)
    expect(mixedView.container.querySelectorAll('[data-state="warning"]')).toHaveLength(1)
    mixedView.unmount()

    const interruptedView = render(<WorkflowRunPanel {...panelProps({
      name: 'repo-audit', status: 'interrupted',
      phases: [phase({
        members: [
          { seq: 1, label: 'done', childId: 'child-1' as SessionId, status: 'completed' },
          { seq: 2, label: 'interrupted', childId: 'child-2' as SessionId, status: 'interrupted' },
        ],
      })],
    })} />)
    expect(screen.getByText('已完成 1 · 已中断 1')).toBeTruthy()
    expect(interruptedView.container.querySelector('[data-run-status="interrupted"]')).toBeTruthy()
    expect(interruptedView.container.querySelectorAll('[data-state="warning"]')).toHaveLength(2)
  })

  it('defers normal completion collapse until focused member content loses focus', () => {
    const sessions = listState({
      ids: [PARENT_ID, CHILD_ID, SECOND_ID],
      projectionsBySession: {
        [CHILD_ID]: { state: 'ready', error: null, values: { subagent: { mode: 'one-shot', seq: SessionSeq(0) } } },
        [SECOND_ID]: { state: 'ready', error: null, values: { subagent: { mode: 'one-shot', seq: SessionSeq(0) } } },
      },
      byId: {
        ...listState().byId,
        [SECOND_ID]: {
          id: SECOND_ID, displayTitle: 'second', parentId: PARENT_ID, origin: 'subagent',
          running: true, blank: false, updatedAt: 0,
        },
      },
    })
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase({
        members: [
          { seq: 1, label: 'worker', childId: CHILD_ID, status: 'running' },
          { seq: 2, label: 'second', childId: SECOND_ID, status: 'running' },
        ],
      })],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running, sessions)} />)
    const member = screen.getByRole('button', { name: '打开 worker' })
    const second = screen.getByRole('button', { name: '打开 second' })
    const runHeader = screen.getByRole('button', { name: /^audit/ })
    const phaseHeader = screen.getByRole('button', { name: /未分阶段/ })
    member.focus()
    expect(document.activeElement).toBe(member)
    fireEvent.blur(member, { relatedTarget: second })
    second.focus()
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('true')

    const outside = document.createElement('button')
    document.body.append(outside)
    fireEvent.blur(second, { relatedTarget: outside })
    outside.focus()
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('true')
    member.focus()

    view.rerender(<WorkflowRunPanel {...panelProps({
      name: 'audit', status: 'completed',
      phases: [phase({
        members: [
          { seq: 1, label: 'worker', childId: CHILD_ID, status: 'completed' },
          { seq: 2, label: 'second', childId: SECOND_ID, status: 'completed' },
        ],
      })],
    }, sessions)} />)
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('true')
    const retained = screen.getByRole('button', { name: 'worker' })
    expect(retained.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(retained)

    fireEvent.blur(retained, { relatedTarget: outside })
    outside.focus()
    expect(document.activeElement).toBe(outside)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(runHeader)
    const completedPhase = screen.getByRole('button', { name: /未分阶段/ })
    expect(completedPhase.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(completedPhase)
    expect(screen.queryByRole('button', { name: '打开 worker' })).toBeNull()
    expect(screen.getByText('worker')).toBeTruthy()
    outside.remove()
  })

  it('handles a pointer blur and header click as one pending-completion close', () => {
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    const member = screen.getByRole('button', { name: '打开 worker' })
    member.focus()
    view.rerender(<WorkflowRunPanel {...panelProps({
      name: 'audit', status: 'completed',
      phases: [phase({
        members: [{ seq: 1, label: 'worker', childId: CHILD_ID, status: 'completed' }],
      })],
    })} />)
    const retained = screen.getByRole('button', { name: 'worker' })
    const phaseHeader = screen.getByRole('button', { name: /未分阶段/ })
    const runHeader = screen.getByRole('button', { name: /^audit/ })

    expect(fireEvent.mouseDown(retained)).toBe(true)
    expect(document.activeElement).toBe(retained)
    expect(fireEvent.mouseDown(phaseHeader)).toBe(false)
    fireEvent.click(phaseHeader)
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('false')
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')

    expect(fireEvent.mouseDown(runHeader)).toBe(false)
    fireEvent.click(runHeader)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
  })

  it('settles pending completion when keyboard focus moves from content to its header', () => {
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    const member = screen.getByRole('button', { name: '打开 worker' })
    member.focus()
    view.rerender(<WorkflowRunPanel {...panelProps({
      ...running,
      phases: [phase({
        members: [{ seq: 1, label: 'worker', childId: CHILD_ID, status: 'completed' }],
      })],
    })} />)
    const retained = screen.getByRole('button', { name: 'worker' })
    const phaseHeader = screen.getByRole('button', { name: /未分阶段/ })
    const runHeader = screen.getByRole('button', { name: /^audit/ })
    fireEvent.blur(retained, { relatedTarget: phaseHeader })
    phaseHeader.focus()
    expect(phaseHeader.getAttribute('aria-expanded')).toBe('false')
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')

    view.rerender(<WorkflowRunPanel {...panelProps({
      ...running,
      status: 'completed',
      phases: [phase({
        members: [{ seq: 1, label: 'worker', childId: CHILD_ID, status: 'completed' }],
      })],
    })} />)
    expect(runHeader.getAttribute('aria-expanded')).toBe('true')
    fireEvent.blur(phaseHeader, { relatedTarget: runHeader })
    runHeader.focus()
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
  })

  it('settles a deferred phase close when the user hides the outer run', () => {
    const running: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(running)} />)
    const member = screen.getByRole('button', { name: '打开 worker' })
    member.focus()
    view.rerender(<WorkflowRunPanel {...panelProps({
      ...running,
      phases: [phase({
        members: [{ seq: 1, label: 'worker', childId: CHILD_ID, status: 'completed' }],
      })],
    })} />)
    const runHeader = screen.getByRole('button', { name: /^audit/ })
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(runHeader)
    expect(runHeader.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(runHeader)
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('reinitializes manual choices from durable facts after a renderer remount', () => {
    const data: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(data)} />)
    fireEvent.click(screen.getByRole('button', { name: /未分阶段/ }))
    fireEvent.click(screen.getByRole('button', { name: /^audit/ }))
    view.unmount()
    render(<WorkflowRunPanel {...panelProps(data)} />)
    expect(screen.getByRole('button', { name: /^audit/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /未分阶段/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it.each(['one-shot', 'continuable'] as const)('opens a running %s member from its own identity without a parent catalog', (mode) => {
    const data: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const openSession = vi.fn()
    const sessions = listState({ projectionsBySession: { [CHILD_ID]: { state: 'ready', error: null, values: {
      subagent: { mode, label: 'worker', seq: SessionSeq(0) },
    } } } })
    render(<WorkflowRunPanel {...panelProps(data, sessions, openSession)} />)
    fireEvent.click(screen.getByRole('button', { name: '打开 worker' }))
    expect(openSession).toHaveBeenCalledWith({
      parentSessionId: PARENT_ID,
      childSessionId: CHILD_ID,
      mode,
    })
  })

  it('uses observed running state for a member absent from the visible list', () => {
    const data: TestRunData = { name: 'audit', status: 'running', phases: [phase()] }
    const sessions = listState({
      ids: [PARENT_ID],
      byId: { ...listState().byId, [CHILD_ID]: { ...listState().byId[CHILD_ID]!, running: false } },
    })
    const openSession = vi.fn()
    let statuses = new Map([[CHILD_ID, { running: true, pendingInteraction: undefined, completionUnread: false }]])
    const props: WorkflowRunPanelProps = { ...panelProps(data, sessions, openSession),
      useSessionStatus: select => select(statuses),
    }
    const view = render(<WorkflowRunPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '打开 worker' }))
    expect(openSession).toHaveBeenCalledWith({ parentSessionId: PARENT_ID, childSessionId: CHILD_ID, mode: 'one-shot' })
    statuses = new Map([[CHILD_ID, { running: false, pendingInteraction: undefined, completionUnread: false }]])
    view.rerender(<WorkflowRunPanel {...props} />)
    expect(screen.queryByRole('button', { name: '打开 worker' })).toBeNull()
  })

  it('promotes a running member when its own identity arrives', () => {
    const data: TestRunData = {
      name: 'audit', status: 'running', phases: [phase()],
    }
    const view = render(<WorkflowRunPanel {...panelProps(data, listState({ projectionsBySession: {} }))} />)
    expect(screen.queryByRole('button', { name: '打开 worker' })).toBeNull()
    view.rerender(<WorkflowRunPanel {...panelProps(data, listState())} />)
    expect(screen.getByRole('button', { name: '打开 worker' })).toBeTruthy()
  })

  it.each([
    ['external execution', listState({ ids: [PARENT_ID], byId: { [PARENT_ID]: listState().byId[PARENT_ID]! }, projectionsBySession: {} }), 'running'],
    ['identity absent', listState({ projectionsBySession: {} }), 'running'],
    ['identity invalid', listState({ projectionsBySession: { [CHILD_ID]: { state: 'ready', error: null, values: { subagent: null } } } }), 'running'],
    ['wrong parent', listState({ byId: { ...listState().byId, [CHILD_ID]: { ...listState().byId[CHILD_ID]!, parentId: 'other' as SessionId } } }), 'running'],
    ['child inactive', listState({ byId: { ...listState().byId, [CHILD_ID]: { ...listState().byId[CHILD_ID]!, running: false } } }), 'running'],
    ['member terminal', listState(), 'completed'],
  ] as const)('does not navigate when %s', (_name, sessions, memberStatus) => {
    const data: TestRunData = {
      name: 'audit', status: 'running',
      phases: [phase({
        members: [{
          seq: 1, label: 'worker', childId: 'child-1' as SessionId, status: memberStatus,
        }],
      })],
    }
    render(<WorkflowRunPanel {...panelProps(data, sessions)} />)
    expect(screen.queryByRole('button', { name: '打开 worker' })).toBeNull()
    cleanup()
  })
})

describe('plugin lifecycle', () => {
  it('registers and removes the Definition and keyed renderer with its fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
    ctx.provide('remote', { $on: () => () => {} } as never)
    ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
    const sessions = new TestSessions(async (action) => { await action() }, ctx)
    ctx.provide('sessions', sessions)
    const openSession = vi.fn(async () => {})
    ctx.provide('uiWorkspace', { openSession } as never)
    const openTab = vi.fn()
    const unregisterTab = vi.fn()
    const registerTab = vi.fn((_definition: { readonly kind: string; readonly title: () => string }) => unregisterTab)
    ctx.provide('sidebarRight', { openTab } as never)
    ctx.provide('sidebarRightTabs', { register: registerTab } as never)
    const conversationEvents = new UiConversation(ctx, ctx.sessions).events
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      },
    } as never, () => null)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(conversationEvents.entries().map(entry => entry.kind)).toEqual(['workflow-run'])
    expect(ctx.slots.entries('conversation.chat.node')).toHaveLength(1)
    const entry = ctx.slots.entries('conversation.chat.node')[0]!
    const face = entry.inject?.() as unknown as WorkflowRunInjected
    face.openSession(CHILD_ID)
    expect(openSession).toHaveBeenCalledExactlyOnceWith(CHILD_ID)
    face.openRuns()
    expect(openTab).toHaveBeenCalledExactlyOnceWith('workflow-runs')
    expect(registerTab.mock.calls[0]![0].kind).toBe('workflow-runs')
    expect(registerTab.mock.calls[0]![0].title()).toBeTruthy()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(1)
    await fiber.dispose()
    expect(conversationEvents.entries()).toEqual([])
    expect(ctx.slots.entries('conversation.chat.node')).toEqual([])
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toEqual([])
    expect(unregisterTab).toHaveBeenCalledOnce()

    const replacement = ctx.plugin({ inject: [...inject], apply })
    await replacement.await()
    expect(conversationEvents.entries().map(entry => entry.kind)).toEqual(['workflow-run'])
    expect(ctx.slots.entries('conversation.chat.node')).toHaveLength(1)
    await replacement.dispose()
  })

  it('keeps the node half inert', () => {
    applyNode()
  })
})
