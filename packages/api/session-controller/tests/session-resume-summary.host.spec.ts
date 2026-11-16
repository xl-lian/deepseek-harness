/**
 * Cold resume publishes the Session row through `api-session/added`, whose
 * Remote forwarder rejects any argument that is not lossless JSON. A summary
 * column from a malformed projection view must not reject the Agent
 * publication that announces the row.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionAccess, SessionHandle } from '@deepseek-ai/dsh-session-persistence'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { isJsonValue } from '@deepseek-ai/dsh-util-values'
import { z } from 'zod'
import type { SessionSummary } from '../src/types.ts'
import { createSessionTestRemote, testSessionPersistence } from './test-remote.ts'

const sessionId = 'session-stopped-during-workflow' as SessionId

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** The tail a SIGINT during a background workflow job leaves behind: no run end, no job settlement. */
function stoppedDuringWorkflow(message: ReturnType<typeof createUserMessage>): SessionEvent[] {
  const callId = 'call-workflow'
  return [
    { type: 'agent/inbox/spliced', seq: SessionSeq(0), time: 1001, data: { target: 'next-turn', start: 0, inserted: [message] } },
    { type: 'turn/start', seq: SessionSeq(1), time: 1002, data: { turn: 1 } },
    { type: 'tool-workflow/run-start', seq: SessionSeq(2), time: 1003, data: { runId: 'run-1', name: 'campaign' } },
    {
      type: 'job/registered', seq: SessionSeq(3), time: 1004,
      data: { jobId: 'workflow-1', owner: sessionId, kind: 'workflow', label: 'campaign', startedAt: 1004, toolCall: { callId, rootCallId: callId } },
    },
    { type: 'turn/end', seq: SessionSeq(4), time: 1005, data: { turn: 1, reason: { kind: 'interrupted' } } },
  ] as SessionEvent[]
}

interface Harness {
  readonly ctx: Context
  readonly published: SessionSummary[]
  readonly removed: SessionId[]
  readonly errors: string[]
  readonly logged: string[]
  /** Open the history and let its background promotion settle. */
  readonly open: (settled: () => void) => Promise<void>
}

/** Compose a stored Session with the stop-during-workflow tail, the projection cache, and the Remote argument check. */
async function harness(): Promise<Harness> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await mountAgentLoopTestHarness(ctx)
  const root = await mkdtemp(join(tmpdir(), 'dsh-api-resume-summary-'))
  roots.push(root)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const meta: SessionHeader = { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: 1000, isSeeded: false, cwd: '/proj' }
  const message = createUserMessage({ content: [{ type: 'text', text: 'queued before the stop' }], source: { kind: 'user' } })
  const events = stoppedDuringWorkflow(message)
  ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
    list: () => Promise.resolve([meta]),
    inspect: () => Promise.resolve({ meta, events }),
    open: (_id: SessionId, access: SessionAccess): Promise<SessionHandle> => Promise.resolve({
      id: sessionId,
      header: meta,
      inheritedEventCount: SessionLogOffset(0),
      access,
      read: () => Promise.resolve({ eventState: 'detached', events: structuredClone(events) }),
      append: (appended) => { events.push(...appended); return Promise.resolve() },
      flush: () => Promise.resolve(),
      close: () => Promise.resolve(),
      [Symbol.asyncDispose]: () => Promise.resolve(),
    }),
  }) as never)
  await ctx.sessionProjections.register({
    key: 'lossyColumn',
    stateVersion: 1,
    stateSchema: z.object({ seen: z.number() }),
    init: () => ({ seen: 0 }),
    apply: (state: { seen: number }) => ({ seen: state.seen + 1 }),
    wire: {
      viewSchema: z.object({ seen: z.number(), section: z.string().optional() }),
      view: (state: { seen: number }) => ({ seen: state.seen, section: undefined }),
    },
  } as never)
  // The cache's creation checkpoint materializes every unit before the row is announced.
  await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60_000 })
  const published: SessionSummary[] = []
  // Mirrors the Remote forwarder's argument check for allowlisted events.
  ctx.on('api-session/added', (summary) => {
    if (!isJsonValue(summary)) throw new Error('forwarded host event "api-session/added" argument 0 is not lossless JSON data')
    published.push(summary)
  })
  const removed: SessionId[] = []
  ctx.on('api-session/removed', (id) => { removed.push(id) })
  const errors: string[] = []
  ctx.on('api-session/error', (_id, message) => { errors.push(message) })
  const logged: string[] = []
  vi.spyOn(ctx.logger, 'error').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')) })
  const remote = await createSessionTestRemote(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
  return {
    ctx, published, removed, errors, logged,
    open: async (settled) => {
      // Opening the history observes the stored log and promotes it to a live Agent in the background.
      const abort = new AbortController()
      const iterator = remote.follow({ address: { kind: 'session', sessionId } }, abort.signal)[Symbol.asyncIterator]()
      expect((await iterator.next()).value).toMatchObject({ type: 'snapshot' })
      // Promotion starts once the reader asks for the frame after the snapshot.
      const waiting = iterator.next()
      await vi.waitFor(settled)
      abort.abort()
      await waiting
    },
  }
}

describe('cold resume row publication', () => {
  it('resumes and publishes the row without a projection column that is not lossless JSON', async () => {
    const { ctx, published, errors, logged, open } = await harness()

    await open(() => {
      expect(errors).toEqual([])
      expect(ctx.agents.get(sessionId)).toBeDefined()
    })

    const row = published.findLast(summary => summary.sessionId === sessionId && summary.agentAvailable)
    expect(row).toBeDefined()
    expect(row?.projections?.values).not.toHaveProperty('lossyColumn')
    expect(logged.join('\n')).toContain('projection column "lossyColumn"')
    await ctx.fiber.dispose()
  })

  it('keeps the row listed and reports the failure when the resume rolls back', async () => {
    const { ctx, removed, errors, open } = await harness()
    ctx.on('agent/created', () => { throw new Error('creation listener failed') })

    await open(() => { expect(errors).toHaveLength(1) })

    expect(errors[0]).toContain('creation listener failed')
    expect(ctx.agents.get(sessionId)).toBeUndefined()
    expect(removed).toEqual([])
    await ctx.fiber.dispose()
  })
})
