/**
 * The model-facing `workflow` tool: run a JavaScript orchestration script that fans out
 * subagents, and return the script's final value. It owns the model-facing schema and run lifecycle; script
 * parsing, execution, caps, and cancellation live behind `ctx.workflowEngine`
 * (`@deepseek-ai/dsh-workflow`), so a hardened engine swaps in without touching what the model
 * sees. Foreground execution awaits `run.result` and always disposes the run; non-completed reasons
 * become tool errors. `run_in_background: true` instead registers the run as an owned `ctx.jobs` job
 * and returns its id immediately — the job's output ring streams live progress, and the run's value
 * arrives with the job's completion notice. Presentation is an args-only generic card
 * titled from `meta.name`. Explicit-ask usage guidance is registered as the tool's own prompt
 * section rather than deployment persona prose.
 * @module @deepseek-ai/dsh-tool-workflow
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JobId, JobOutcome, JobToolCall } from '@deepseek-ai/dsh-jobs'
import type { Session, SessionEventMap } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  WorkflowMeta, WorkflowResult, WorkflowRun, WorkflowRunId, WorkflowStopReason,
} from '@deepseek-ai/dsh-workflow'
import { createWorkflowRecordMirror } from './record.ts'
import { loadSavedWorkflows, readSavedScript, renderSavedWorkflowList } from './saved.ts'
import type { SavedWorkflow } from './saved.ts'
import type { WorkflowRecordMirror } from './record.ts'
import type {
  ToolWorkflowAgentEndData, ToolWorkflowAgentStartData, ToolWorkflowLogData, ToolWorkflowMetricData, ToolWorkflowPhaseData,
  ToolWorkflowRunEndData, ToolWorkflowRunStartData,
} from './types.ts'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    workflow: 'workflow'
  }
}

export const name = 'tool-workflow'
export const inject = ['tools', 'workflowEngine', 'systemPrompt']

/** Config: the model-facing tool name plus result rendering caps. */
export interface Config {
  /** The model-facing tool name to register (default `workflow`). */
  toolName?: string
  /** Rendered-result ceiling, in characters: a longer JSON value is truncated with a notice (default 50000). */
  maxResultChars?: number
  /**
   * Expose `run_in_background` (default true); disabled calls are also
   * rejected. A background run needs a live `ctx.jobs` registry with a
   * controller serving the caller (`dsh-jobs-local` plus `dsh-tool-jobs` in
   * the shipped composition); without one the call fails with the missing
   * piece named.
   */
  enableRunInBackground?: boolean
  /**
   * Directories of saved workflows, each a `<name>.meta.json` beside a
   * `<name>.js` script body (default none). While the list yields any workflow
   * the tool accepts `name` in place of `script` and `meta`. Relative entries
   * resolve against the process working directory.
   */
  workflowDirs?: string[]
  /** Maximum `log()` lines one top-level run writes to the Session log (default 500). */
  maxRecordedLogLines?: number
  /** Maximum `phase()` transitions one top-level run writes to the Session log (default 500). */
  maxRecordedPhases?: number
  /** Longest recorded log line or phase title in characters; longer text is clipped (default 2000). */
  maxRecordedLineChars?: number
  /** Maximum `metric()` values one top-level run writes to the Session log (default 4096). */
  maxRecordedMetrics?: number
}

export const Config: z<Config> = z.object({
  toolName: z.string().default('workflow'),
  maxResultChars: z.natural().min(1).default(50_000),
  enableRunInBackground: z.boolean().default(true),
  workflowDirs: z.array(z.string()).default([]),
  maxRecordedLogLines: z.natural().default(500),
  maxRecordedPhases: z.natural().default(500),
  maxRecordedLineChars: z.natural().min(1).default(2_000),
  maxRecordedMetrics: z.natural().default(4096),
})

type ResolvedConfig = Required<Config>

interface WorkflowRecorder {
  start(session: Session, run: WorkflowRun, scriptSha256: string | undefined): void
  finish(runId: WorkflowRunId, stopReason: WorkflowStopReason): void
  abandon(runId: WorkflowRunId): void
}

interface ToolWorkflowRecordEventMap {
  'tool-workflow/run-start': ToolWorkflowRunStartData
  'tool-workflow/agent-start': ToolWorkflowAgentStartData
  'tool-workflow/agent-end': ToolWorkflowAgentEndData
  'tool-workflow/phase': ToolWorkflowPhaseData
  'tool-workflow/log': ToolWorkflowLogData
  'tool-workflow/metric': ToolWorkflowMetricData
  'tool-workflow/run-end': ToolWorkflowRunEndData
}

/** The caps applied to one run's recorded progress. */
type WorkflowRecordingLimits = Pick<ResolvedConfig, 'maxRecordedLogLines' | 'maxRecordedPhases' | 'maxRecordedLineChars' | 'maxRecordedMetrics'>

/** One run being recorded into its parent Session. */
interface ActiveWorkflowRecord {
  readonly session: Session
  logLines: number
  phases: number
  metrics: number
  dropped: number
}

function clipRecordedLine(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`
}

/** Render a contained recording failure without trusting the thrown value. */
function renderRecordingError(error: unknown): string {
  try {
    return String(error)
  } catch {
    return '[unrenderable thrown value]'
  }
}

/**
 * Project active top-level workflow runs into their parent Sessions without
 * letting recording failure affect tool execution.
 */
function createWorkflowRecorder(ctx: Context, limits: WorkflowRecordingLimits): WorkflowRecorder {
  const active = new Map<WorkflowRunId, ActiveWorkflowRecord>()
  const append = <Type extends keyof ToolWorkflowRecordEventMap>(
    session: Session,
    type: Type,
    data: SessionEventMap[Type],
  ): boolean => {
    // These four package-owned events are all log-only. Narrowing the generic
    // append face here discharges Session.append's conditional options tuple.
    const appendRecord = session.append.bind(session) as <Event extends keyof ToolWorkflowRecordEventMap>(
      event: Event,
      value: SessionEventMap[Event],
    ) => void
    try {
      appendRecord(type, data)
      return true
    } catch (error: unknown) {
      ctx.logger.warn(`tool-workflow: disabled durable record after ${type} append failed: ${renderRecordingError(error)}`)
      return false
    }
  }

  ctx.on('workflow/phase', (info, title) => {
    const record = active.get(info.id)
    if (record === undefined) return
    if (record.phases >= limits.maxRecordedPhases) {
      record.dropped += 1
      return
    }
    record.phases += 1
    const data: ToolWorkflowPhaseData = { runId: info.id, title: clipRecordedLine(title, limits.maxRecordedLineChars) }
    if (!append(record.session, 'tool-workflow/phase', data)) active.delete(info.id)
  })
  ctx.on('workflow/log', (info, message) => {
    const record = active.get(info.id)
    if (record === undefined) return
    if (record.logLines >= limits.maxRecordedLogLines) {
      record.dropped += 1
      return
    }
    record.logLines += 1
    const data: ToolWorkflowLogData = { runId: info.id, message: clipRecordedLine(message, limits.maxRecordedLineChars) }
    if (!append(record.session, 'tool-workflow/log', data)) active.delete(info.id)
  })
  ctx.on('workflow/metric', (info, metric) => {
    const record = active.get(info.id)
    if (record === undefined) return
    if (record.metrics >= limits.maxRecordedMetrics) {
      record.dropped += 1
      return
    }
    record.metrics += 1
    const data: ToolWorkflowMetricData = { runId: info.id, ...metric }
    if (!append(record.session, 'tool-workflow/metric', data)) active.delete(info.id)
  })
  ctx.on('workflow/agent-start', (info, agent) => {
    const session = active.get(info.id)?.session
    if (session === undefined) return
    const data: ToolWorkflowAgentStartData = {
      runId: info.id,
      seq: agent.seq,
      label: agent.label,
      ...agent.phase === undefined ? {} : { phase: agent.phase },
      childId: agent.childId,
    }
    if (!append(session, 'tool-workflow/agent-start', data)) active.delete(info.id)
  })
  ctx.on('workflow/agent-end', (info, agent) => {
    const session = active.get(info.id)?.session
    if (session === undefined) return
    const data: ToolWorkflowAgentEndData = {
      runId: info.id,
      seq: agent.seq,
      outcome: agent.outcome,
    }
    if (!append(session, 'tool-workflow/agent-end', data)) active.delete(info.id)
  })

  return {
    start(session, run, scriptSha256) {
      const data: ToolWorkflowRunStartData = {
        runId: run.id,
        name: run.meta.name,
        ...scriptSha256 === undefined ? {} : { scriptSha256 },
      }
      if (append(session, 'tool-workflow/run-start', data)) {
        active.set(run.id, { session, logLines: 0, phases: 0, metrics: 0, dropped: 0 })
      }
    },
    finish(runId, stopReason) {
      const record = active.get(runId)
      if (record !== undefined) {
        append(record.session, 'tool-workflow/run-end', {
          runId,
          stopReason,
          ...record.dropped === 0 ? {} : { progressEventsDropped: record.dropped },
        })
      }
      active.delete(runId)
    },
    abandon: (runId) => { active.delete(runId) },
  }
}

/**
 * The script-authoring contract, embedded in the tool description: the hooks,
 * their exact semantics, and the supported schema subset. Parameter-level
 * rules live in the parameter descriptions.
 */
const DESCRIPTION = `Run a JavaScript workflow script that orchestrates subagents at scale. Use this for work that fans out across many independent pieces — an audit over many files, a migration, multi-angle research, adversarial verification of findings — where you write the orchestration as a script instead of delegating turn by turn.

Script-body hooks:
- \`agent(prompt, opts?): Promise<any>\` — run one subagent to completion. Without \`opts.schema\` it resolves to the child's final text; with \`opts.schema\` (an object-rooted JSON Schema using ONLY type/properties/required/additionalProperties/items/enum/const/oneOf) it resolves to the validated object. Resolves \`null\` when the child fails (filter with \`.filter(Boolean)\`). Other opts: \`label\` (display), \`phase\` (progress group), and independent \`provider\`/\`model\` LLM target overrides.
- \`pipeline(items, ...stages): Promise<any[]>\` — run each item through the stages independently with NO barrier between stages (prefer this for multi-stage work). Each stage receives \`(prev, item, index)\`. A stage throw drops that ITEM to \`null\` and skips its remaining stages.
- \`parallel(thunks): Promise<any[]>\` — run zero-argument functions concurrently and await ALL of them (a barrier; use only when a stage genuinely needs every prior result together). A throwing thunk resolves to \`null\`.
- \`phase(title)\` — start a progress phase; \`log(message)\` — narrate progress; \`args\` — the tool call's \`args\` input, verbatim.
- \`metric(name, value, opts?)\` — record one finite number for comparison across runs; \`opts.step\` is an optional non-negative integer position in the series.

Misused hooks (bad arguments, unknown options, unsupported schemas, tripped caps) end the whole script instead of producing \`null\`. The script has no filesystem, network, timer, or Node.js APIs; the agents do the work.`

type WorkflowCallArgs = {
  name?: string
  script?: string
  meta?: {
    name: string
    description: string
    whenToUse?: string
    phases?: { title: string; detail?: string; provider?: string; model?: string }[]
  }
  args?: Record<string, unknown>
  run_in_background?: boolean
}

/** One workflow call after `name` or `script` plus `meta` selected what runs. */
interface ResolvedWorkflowCall {
  readonly script: string
  readonly meta: WorkflowMeta
  /** Present for a saved workflow. */
  readonly scriptSha256?: string
}

/** The display name of a call; a malformed call has neither source. */
function callName(args: WorkflowCallArgs): string {
  return args.name ?? args.meta?.name ?? 'unnamed'
}

/**
 * Select what one validated call runs. This is the sole enforcement of the
 * exactly-one-of rule: a parameter map cannot express it as a root `oneOf`.
 * @param args - the tool call.
 * @param saved - the load-time catalog.
 * @returns the script, meta, and, for a saved workflow, the script digest.
 * @throws a model-correctable error for a bad combination or unknown name.
 */
async function resolveWorkflowCall(
  args: WorkflowCallArgs,
  saved: ReadonlyMap<string, SavedWorkflow>,
): Promise<ResolvedWorkflowCall> {
  if (args.name !== undefined) {
    if (args.script !== undefined || args.meta !== undefined) {
      throw new Error('pass either `name` or `script` with `meta`, not both')
    }
    const entry = saved.get(args.name)
    if (entry === undefined) {
      throw new Error(`unknown saved workflow "${args.name}"; available: ${[...saved.keys()].join(', ')}`)
    }
    return { ...await readSavedScript(entry), meta: entry.meta }
  }
  if (args.script === undefined || args.meta === undefined) {
    throw new Error('pass either `name` or both `script` and `meta`')
  }
  return { script: args.script, meta: args.meta }
}

/** The pending-state card: a generic card titled by the workflow's name. */
function presentWorkflowCall(args: WorkflowCallArgs): ToolCallView {
  return {
    card: 'generic',
    title: `workflow: ${callName(args)}`,
    ...args.script === undefined ? {} : { rawInput: args.script },
  }
}

/** The completed-state card: keep the pending title; render the result content as-is. */
function presentWorkflowResult(args: WorkflowCallArgs, result: { content: ContentBlock[]; isError: boolean }): ToolResultView {
  void args
  void result
  return { card: 'generic' }
}

/** A non-`completed` stop reason means the script did not finish cleanly. */
function stopReasonError(result: WorkflowResult): string | undefined {
  switch (result.stopReason) {
    case 'completed':
      return undefined
    case 'cancelled':
      return `workflow run was cancelled${result.error !== undefined ? ` (${result.error})` : ''}`
    case 'error':
      return `workflow run failed: ${result.error ?? 'unknown error'}`
    /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
    default:
      return `workflow run ended abnormally (${String(result.stopReason satisfies never)})`
    /* v8 ignore stop */
  }
}

/**
 * Map a settled background run onto the job outcome vocabulary. A completed
 * run carries the rendered return value as the job's result; a
 * cancelled run leaves the detail to the registry's kill-reason merge (the
 * cancel reason it forwarded is the same string); an errored run fails with
 * the script's failure message.
 */
function jobOutcomeOf(result: WorkflowResult, name: string, maxChars: number): JobOutcome {
  switch (result.stopReason) {
    case 'completed':
      return {
        status: 'completed',
        detail: `${result.agentsStarted} agent${result.agentsStarted === 1 ? '' : 's'}`,
        result: renderResult(name, result.agentsStarted, result.value as JsonValue, maxChars),
      }
    case 'cancelled':
      return { status: 'killed' }
    case 'error':
      return { status: 'failed', detail: result.error ?? 'unknown error' }
    /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
    default:
      return { status: 'failed', detail: `workflow run ended abnormally (${String(result.stopReason satisfies never)})` }
    /* v8 ignore stop */
  }
}

/** Render the run's outcome text: the meta name, agent count, and the JSON value (capped). */
function renderResult(name: string, agentsStarted: number, value: JsonValue, maxChars: number): string {
  // The engine returns JSON data (null for a valueless script), so stringify never yields undefined.
  const rendered = JSON.stringify(value, null, 2)
  const clipped = rendered.length > maxChars
    ? `${rendered.slice(0, maxChars)}\n… [truncated: ${rendered.length - maxChars} more characters]`
    : rendered
  return `workflow "${name}" completed (${agentsStarted} agent${agentsStarted === 1 ? '' : 's'}).\nReturn value:\n${clipped}`
}

/**
 * Register a background run as an owned job. The engine run is started
 * inside the job starter with no tool-step signal — the run belongs to the
 * job, so a registry kill or owner teardown is what cancels it — and its
 * settlement is the job's settlement: dispose, stop the mirrors, then map the
 * stop reason onto the job outcome (a completed run's rendered return value
 * rides `result` to the model's first read after settlement).
 * @param ctx - plugin context (engine, optional jobs registry, logger).
 * @param call - the resolved script and identity.
 * @param scriptArgs - the call's optional `args` input.
 * @param parent - the calling agent; owns the job.
 * @param toolCall - creating invocation, including its root call.
 * @param recordsRun - whether this top-level call records durable run events.
 * @param deps - the tool's recorder/mirror taps and the render cap.
 * @returns the background result for the tool's output schema.
 */
function startBackgroundRun(
  ctx: Context,
  call: ResolvedWorkflowCall,
  scriptArgs: Record<string, unknown> | undefined,
  parent: Agent,
  toolCall: JobToolCall,
  recordsRun: boolean,
  deps: { recorder: WorkflowRecorder; mirror: WorkflowRecordMirror; maxResultChars: number },
): { kind: 'background'; jobId: JobId; runId: WorkflowRunId } {
  const jobs = ctx.get('jobs')
  if (jobs === undefined) {
    throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
  }
  let run!: WorkflowRun
  const jobId = jobs.start({
    kind: 'workflow',
    label: call.meta.name,
    owner: parent.id,
    toolCall,
    run: (job) => {
      // A synchronous engine rejection (META_INVALID/SCRIPT_PARSE) propagates
      // out of the starter, so the registry registers nothing and the model
      // sees the violation list as an ordinary tool error.
      run = ctx.workflowEngine.start({
        script: call.script,
        meta: call.meta,
        ...scriptArgs !== undefined ? { args: scriptArgs } : {},
        parent,
      })
      deps.mirror.start(run.id, job)
      if (recordsRun) deps.recorder.start(parent.session, run, call.scriptSha256)
      const done = run.result.then(async (result): Promise<JobOutcome> => {
        try {
          // Keep member listeners alive through disposal: an engine may
          // synthesize cancelled member endings while reaching quiescence.
          await run.dispose()
        } catch (error: unknown) {
          // done must not reject; a failed disposal still has a settled result to report.
          ctx.logger.warn(`background workflow run ${run.id} dispose failed: ${String(error)}`)
        }
        deps.mirror.stop(run.id)
        if (recordsRun) {
          deps.recorder.finish(run.id, result.stopReason)
          deps.recorder.abandon(run.id)
        }
        return jobOutcomeOf(result, call.meta.name, deps.maxResultChars)
      })
      return {
        cancel: (reason?: string) => { run.cancel(reason ?? 'background workflow job killed') },
        done,
      }
    },
  })
  return { kind: 'background' as const, jobId, runId: run.id }
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  // schemastery (the exported Config schema) has already filled the defaulted
  // fields; the assertion records that resolution, not a hidden fallback.
  const resolved = config as ResolvedConfig
  const { toolName, maxResultChars, enableRunInBackground, workflowDirs } = resolved
  const saved = await loadSavedWorkflows(workflowDirs)
  // With no saved workflows the schema and guidance stay exactly the inline form.
  const hasSaved = saved.size > 0
  const inlineRequirement: { required?: true } = hasSaved ? {} : { required: true }
  const recorder = createWorkflowRecorder(ctx, resolved)
  const mirror = createWorkflowRecordMirror(ctx)
  // Usage policy ships with the tool (the master convention: tool guidance
  // lives in tool plugins as prompt sections, not in the deployment persona).
  ctx.systemPrompt.section({
    name: `tool:${toolName}`,
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: `Use the ${toolName} tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.${hasSaved
      ? '\n\nThe user may also ask for one of these saved workflows. Run it by passing `name` instead of `script` and `meta`; '
        + `\`args\` still applies.\n${renderSavedWorkflowList(saved)}`
      : ''}`,
  })
  ctx.tools.register(defineTool({
    name: toolName,
    description: DESCRIPTION,
    parameters: {
      ...hasSaved ? {
        name: {
          type: 'string' as const,
          description: 'Name of a saved workflow to run, in place of `script` and `meta`.',
        },
      } : {},
      script: {
        type: 'string',
        ...inlineRequirement,
        description: 'The plain JavaScript body, not TypeScript and without an `export const meta` statement; top-level await is allowed. '
          + 'End with `return <value>`; the JSON-serializable value is this tool\'s result.',
      },
      meta: {
        type: 'object',
        additionalProperties: true,
        ...inlineRequirement,
        description: 'The workflow identity as plain JSON, not code.',
        properties: {
          name: { type: 'string', required: true, description: 'Short kebab-case workflow name.' },
          description: { type: 'string', required: true, description: 'One-line description of what the workflow does.' },
          whenToUse: { type: 'string', description: 'Optional guidance on when this workflow applies.' },
          phases: {
            type: 'array',
            description: 'Optional phase declarations matched by phase() calls.',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                title: { type: 'string', required: true, description: 'The phase title phase() calls match by exact string.' },
                detail: { type: 'string', description: 'Optional one-line description of the phase.' },
                provider: { type: 'string', description: 'Optional provider override this phase is expected to use.' },
                model: { type: 'string', description: 'Optional model override this phase is expected to use.' },
              },
            },
          },
        },
      },
      args: {
        type: 'object',
        additionalProperties: true,
        description: 'Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {"files": [...]}).',
      },
      ...enableRunInBackground ? {
        run_in_background: {
          type: 'boolean' as const,
          description: 'Run as a background job: return a job id immediately instead of waiting; the return value arrives with the completion notice.',
        },
      } : {},
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'background' },
              jobId: { type: 'string', required: true },
              runId: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'foreground' },
              runId: { type: 'string', required: true },
              agentsStarted: { type: 'integer', required: true },
              result: { type: 'json', required: true },
            },
          },
        ],
      },
      render: (args, value) => [{
        type: 'text',
        text: value.kind === 'background'
          ? `workflow "${callName(args)}" started in the background as job ${value.jobId}. Its return value arrives with the completion notice; check on it with job_output, stop it with job_kill.`
          : renderResult(callName(args), value.agentsStarted, value.result, maxResultChars),
      }],
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (!parent) {
        // The loop sets `exec.agent` for every model-driven call; its absence
        // means a non-agent caller invoked the tool directly, which has no
        // parent to attribute the children to. Fail loud rather than guess.
        throw new Error('workflow tool requires a calling agent (exec.agent was undefined)')
      }
      const call = await resolveWorkflowCall(args, saved)
      if (args.run_in_background === true) {
        if (!enableRunInBackground) {
          throw new Error('run_in_background is disabled for this tool')
        }
        // Reading a saved script is the only await between ToolRuntime's
        // pre-execute signal check and jobs.start.
        exec.signal.throwIfAborted()
        const toolCall = { callId: exec.callId, rootCallId: exec.rootCallId }
        return startBackgroundRun(ctx, call, args.args, parent, toolCall, exec.parent === undefined, {
          recorder,
          mirror,
          maxResultChars,
        })
      }

      // Meta/body validation failures (META_INVALID/SCRIPT_PARSE) throw
      // synchronously here and become isError results via the registry — the
      // model sees the violation list and can correct the call.
      const run = ctx.workflowEngine.start({
        script: call.script,
        meta: call.meta,
        ...args.args !== undefined ? { args: args.args } : {},
        parent,
        signal: exec.signal,
      })
      const recordsRun = exec.parent === undefined
      // The engine publishes member events after start() returns and this run record is active.
      if (recordsRun) recorder.start(parent.session, run, call.scriptSha256)

      // Bridge the tool's abort signal to the run: if the parent step is aborted while the
      // script is in flight, cancel the whole run. The signal also enters the engine directly, but
      // this local bridge preserves the tool contract even if an implementation ignores it.
      const onAbort = (): void => { run.cancel('parent step aborted') }
      exec.signal.addEventListener('abort', onAbort, { once: true })

      let result: WorkflowResult | undefined
      try {
        result = await run.result
        const error = stopReasonError(result)
        if (error !== undefined) {
          // Map a non-clean finish to an isError result (the registry turns a
          // throw into an isError). Report the reason, not partial output.
          throw new Error(error)
        }
        return {
          kind: 'foreground' as const,
          runId: run.id,
          agentsStarted: result.agentsStarted,
          result: result.value as JsonValue,
        }
      } finally {
        exec.signal.removeEventListener('abort', onAbort)
        try {
          // Keep member listeners alive through disposal: an engine may
          // synthesize cancelled member endings while reaching quiescence.
          await run.dispose()
          if (recordsRun) {
            /* v8 ignore next -- WorkflowRun.result never rejects by contract, so result is assigned before finally. */
            if (result === undefined) throw new Error('workflow run settled without a result')
            recorder.finish(run.id, result.stopReason)
          }
        } finally {
          if (recordsRun) recorder.abandon(run.id)
        }
      }
    },
    presentCall: args => presentWorkflowCall(args),
    presentResult: (args, result) => presentWorkflowResult(args, result),
  }))
}
