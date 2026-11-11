import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { WorkflowEngine, WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type { WorkflowResult, WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createInboxStub, provideWorkingDirectoryFixture, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import PtcWorkflowEngine from '@deepseek-ai/dsh-workflow-ptc'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { mountWorkflowRuntime } from '../../workflow-ptc/tests/setup.ts'
import * as toolWorkflow from '../src/index.ts'
import { loadSavedWorkflows, readSavedScript, renderSavedWorkflowList } from '../src/saved.ts'
import type {} from '../src/types.ts'

class ImmediateEngine extends WorkflowEngine {
  requests: WorkflowStartRequest[] = []

  start(request: WorkflowStartRequest): WorkflowRun {
    this.requests.push(request)
    const result: WorkflowResult = { value: 'done', stopReason: 'completed', agentsStarted: 0 }
    return {
      id: WorkflowRunId('run-1'),
      meta: request.meta,
      result: Promise.resolve(result),
      cancel: () => {},
      dispose: () => Promise.resolve(),
    }
  }
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-saved-workflows-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function writeWorkflow(dir: string, name: string, script = 'return 1', meta: unknown = { name, description: `about ${name}` }): Promise<void> {
  await writeFile(join(dir, `${name}.meta.json`), JSON.stringify(meta))
  await writeFile(join(dir, `${name}.js`), script)
}

function callerAgent(ctx: Context, session: Session): Agent {
  return {
    id: session.id, options: {}, session, model: unsupportedModel(),
    inbox: createInboxStub(), status: 'idle', ctx,
    send: () => {}, followup: () => {}, steer: () => {}, inject: () => {}, cancel: () => {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
}

async function setup(config: { workflowDirs: string[] }) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(ImmediateEngine)
  await ctx.plugin(toolWorkflow, config)
  const session = Session.create(SessionId('caller'))
  const parent = callerAgent(ctx, session)
  return { ctx, engine: ctx.workflowEngine as ImmediateEngine, parent, session }
}

function execute(ctx: Context, args: unknown, agent: Agent, signal = new AbortController().signal): Promise<ToolExecutionResult> {
  return executeToolFixture(ctx, { signal, callId: ToolCallId('call-1'), name: 'workflow', arguments: args, agent })
}

function errorText(result: ToolExecutionResult): string {
  expect(result.isError).toBe(true)
  return (result.content[0] as { text: string }).text
}

describe('saved workflow catalog', () => {
  it('loads pairs in name order and ignores files that are not meta files', async () => {
    const first = await tempDir()
    const second = await tempDir()
    await writeWorkflow(first, 'mid')
    await writeWorkflow(first, 'zeta')
    await writeWorkflow(second, 'alpha', 'return 2', { name: 'alpha', description: 'first', whenToUse: 'Use early.' })
    await writeFile(join(first, 'notes.txt'), 'x')
    await writeFile(join(first, 'helper.js'), 'x')
    const saved = await loadSavedWorkflows([first, second])
    expect([...saved.keys()]).toEqual(['alpha', 'mid', 'zeta'])
    expect(renderSavedWorkflowList(saved)).toBe('- alpha: first Use early.\n- mid: about mid\n- zeta: about zeta')
  })

  it.each([
    ['a missing directory', async (dir: string) => join(dir, 'absent'), 'cannot be read'],
    ['a file in place of a directory', async (dir: string) => {
      const path = join(dir, 'file')
      await writeFile(path, 'x')
      return path
    }, 'is not a directory'],
    ['a meta file without its script', async (dir: string) => {
      await writeFile(join(dir, 'lone.meta.json'), JSON.stringify({ name: 'lone', description: 'd' }))
      return dir
    }, 'has no script'],
    ['a directory in place of the script', async (dir: string) => {
      await writeFile(join(dir, 'odd.meta.json'), JSON.stringify({ name: 'odd', description: 'd' }))
      await mkdir(join(dir, 'odd.js'))
      return dir
    }, 'is not a file'],
    ['malformed JSON', async (dir: string) => {
      await writeFile(join(dir, 'bad.meta.json'), '{')
      await writeFile(join(dir, 'bad.js'), 'return 1')
      return dir
    }, 'invalid saved workflow'],
    ['invalid meta', async (dir: string) => {
      await writeWorkflow(dir, 'bad', 'return 1', { name: 'bad' })
      return dir
    }, 'meta.description'],
    ['a name that differs from its file', async (dir: string) => {
      await writeWorkflow(dir, 'file-name', 'return 1', { name: 'other', description: 'd' })
      return dir
    }, 'must match its file name'],
  ])('rejects %s at load', async (_label, arrange, message) => {
    const dir = await arrange(await tempDir())
    await expect(loadSavedWorkflows([dir])).rejects.toThrow(message)
  })

  it('rejects one name defined in two directories', async () => {
    const first = await tempDir()
    const second = await tempDir()
    await writeWorkflow(first, 'same')
    await writeWorkflow(second, 'same')
    await expect(loadSavedWorkflows([first, second])).rejects.toThrow('defined in both')
  })

  it('reports a script that became unreadable after load', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'gone')
    const entry = (await loadSavedWorkflows([dir])).get('gone')!
    await rm(entry.scriptPath)
    await expect(readSavedScript(entry)).rejects.toThrow('saved workflow "gone" could not be read')
  })
})

describe('workflow tool with saved workflows', () => {
  it('keeps the inline schema and guidance when none are configured', async () => {
    const { ctx } = await setup({ workflowDirs: [] })
    const parameters = ctx.tools.get('workflow')!.parameters as { required: string[]; properties: Record<string, unknown> }
    expect(parameters.required).toEqual(expect.arrayContaining(['script', 'meta']))
    expect(parameters.properties).not.toHaveProperty('name')
    expect((await ctx.systemPrompt.assemble()).sections.find(section => section.name === 'tool:workflow')?.text).not.toContain('saved workflows')
  })

  it('offers name in place of inline fields and lists the catalog in the prompt', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign')
    const { ctx } = await setup({ workflowDirs: [dir] })
    const parameters = ctx.tools.get('workflow')!.parameters as { required?: string[]; properties: Record<string, unknown> }
    expect(parameters.required ?? []).not.toContain('script')
    expect(parameters.required ?? []).not.toContain('meta')
    expect(parameters.properties).toHaveProperty('name')
    expect((await ctx.systemPrompt.assemble()).sections.find(section => section.name === 'tool:workflow')?.text).toContain('- campaign: about campaign')
  })

  it('runs a saved workflow by name, reads the current script, and records its digest', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign', 'return "old"')
    const { ctx, engine, parent, session } = await setup({ workflowDirs: [dir] })
    await writeFile(join(dir, 'campaign.js'), 'return "new"')
    const result = await execute(ctx, { name: 'campaign', args: { rounds: 2 } }, parent)
    expect(result.isError).toBe(false)
    expect((result.content[0] as { text: string }).text).toContain('workflow "campaign" completed')
    expect(engine.requests[0]).toMatchObject({
      script: 'return "new"',
      meta: { name: 'campaign', description: 'about campaign' },
      args: { rounds: 2 },
    })
    expect(session.snapshotEvents().find(event => event.type === 'tool-workflow/run-start')?.data).toEqual({
      runId: 'run-1',
      name: 'campaign',
      scriptSha256: createHash('sha256').update('return "new"', 'utf8').digest('hex'),
    })
  })

  it('records no digest for an inline script', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign')
    const { ctx, parent, session } = await setup({ workflowDirs: [dir] })
    const result = await execute(ctx, { script: 'return 1', meta: { name: 'inline', description: 'd' } }, parent)
    expect(result.isError).toBe(false)
    expect(session.snapshotEvents().find(event => event.type === 'tool-workflow/run-start')?.data).toEqual({ runId: 'run-1', name: 'inline' })
  })

  it.each([
    ['name with script', { name: 'campaign', script: 'return 1' }, 'not both'],
    ['name with meta', { name: 'campaign', meta: { name: 'x', description: 'd' } }, 'not both'],
    ['neither source', {}, 'pass either `name` or both'],
    ['script without meta', { script: 'return 1' }, 'pass either `name` or both'],
    ['meta without script', { meta: { name: 'x', description: 'd' } }, 'pass either `name` or both'],
    ['an unknown name', { name: 'absent' }, 'available: campaign'],
  ])('refuses %s through the executor', async (_label, args, message) => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign')
    const { ctx, engine, parent } = await setup({ workflowDirs: [dir] })
    expect(errorText(await execute(ctx, args, parent))).toContain(message)
    expect(engine.requests).toHaveLength(0)
  })

  it('titles the card from the saved name and omits raw input', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign')
    const { ctx } = await setup({ workflowDirs: [dir] })
    const tool = ctx.tools.get('workflow')!
    expect(tool.presentCall!({ name: 'campaign' })).toEqual({ card: 'generic', title: 'workflow: campaign' })
    expect(tool.presentCall!({})).toEqual({ card: 'generic', title: 'workflow: unnamed' })
  })

  it('fails plugin load on misconfiguration', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(ImmediateEngine)
    const dir = await tempDir()
    await expect(ctx.plugin(toolWorkflow, { workflowDirs: [join(dir, 'absent')] })).rejects.toThrow('cannot be read')
  })

  it('refuses a background launch aborted while reading the script', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign')
    const { ctx, engine, parent } = await setup({ workflowDirs: [dir] })
    const controller = new AbortController()
    const pending = execute(ctx, { name: 'campaign', run_in_background: true }, parent, controller.signal)
    controller.abort('stop')
    expect((await pending).isError).toBe(true)
    await vi.waitFor(() => { expect(engine.requests).toHaveLength(0) })
  })

  it('executes a saved script through the sandboxed PTC engine', async () => {
    const dir = await tempDir()
    await writeWorkflow(dir, 'campaign', 'phase("Only"); return { rounds: args.rounds }')
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(SessionProjectionRegistry)
    provideWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    ctx.subagents.registerProvider({
      name: 'spawn',
      capabilities: { agentOptions: true, agentPreset: false, outputSchema: true, depthLimit: true },
      inheritsParentContext: false,
      start: () => Promise.reject(new Error('the script starts no child')),
    })
    await mountWorkflowRuntime(ctx)
    await ctx.plugin(PtcWorkflowEngine, {})
    await ctx.plugin(toolWorkflow, { workflowDirs: [dir] })
    const session = Session.create(SessionId('caller'))
    const parent = callerAgent(ctx, session)
    const result = await execute(ctx, { name: 'campaign', args: { rounds: 3 } }, parent)
    expect(result.isError).toBe(false)
    expect((result.content[0] as { text: string }).text).toContain('"rounds": 3')
  })
})
