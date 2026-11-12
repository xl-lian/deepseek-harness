/**
 * Pure classification of tool calls and shell commands into science-agent loop
 * contributions. Shared by the host reducer and the browser Definition so a
 * card anchors at exactly the calls the projection binds to a round.
 */

import type { CallPurpose, StageId } from './types.ts'

/** One `sagent`/`sa` invocation found inside a shell command. */
export interface SagentInvocation {
  /** Subcommand tokens after the global options, e.g. `['round', 'begin']`. */
  readonly sub: readonly string[]
  /** The complete invocation text, shown as the member label. */
  readonly raw: string
}

/** What one tool call contributes to a loop round. */
export interface ToolCallClassification {
  readonly purpose: CallPurpose
  readonly stage?: StageId | undefined
  readonly role?: string | undefined
  readonly agent?: string | undefined
  readonly label?: string | undefined
  readonly roundId?: string | undefined
  readonly mode?: string | undefined
  /** sagent stage name for `round stage` marks (scout/hypotheses/execute/verify/decide/report). */
  readonly stageName?: string | undefined
  /** Status for `round stage` marks (running/completed/failed/skipped). */
  readonly stageStatus?: string | undefined
  /** Outcome from `round end --outcome`, used when the result is not JSON. */
  readonly roundOutcome?: string | undefined
  /** Whether this call may anchor a round card when no round is active. */
  readonly anchors: boolean
}

const SA_DIRECT: Readonly<Record<string, { stage: StageId; role: string }>> = {
  sa_scout: { stage: 'scout', role: 'sa-scout' },
  sa_hypothesis: { stage: 'hypotheses', role: 'sa-hypothesis' },
  sa_engineer: { stage: 'engineer', role: 'sa-engineer' },
  sa_verifier: { stage: 'verifier', role: 'sa-verifier' },
  sa_statistician: { stage: 'statistician', role: 'sa-statistician' },
  sa_reporter: { stage: 'report', role: 'sa-reporter' },
}

const IGNORED_SUBCOMMANDS = new Set([
  'doctor',
  'status',
  'state',
  'ledger',
  'cost',
  'claim',
  'search',
  'submit',
  'objective',
  'holdout',
  'env',
  'templates-path',
  'workflow',
  'plugin',
  'mcp',
])

/** Parse a JSON object argument string, returning undefined for malformed input. */
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

/** Split a shell command into segments on `&&`, `||`, `;`, and newlines outside quotes. */
export function splitShellCommands(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? ''
    if (quote !== undefined) {
      current += char
      if (char === quote && command[index - 1] !== '\\') quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '\n' || char === ';') {
      segments.push(current)
      current = ''
      continue
    }
    if (char === '&' && command[index + 1] === '&') {
      segments.push(current)
      current = ''
      index += 1
      continue
    }
    if (char === '|' && command[index + 1] === '|') {
      segments.push(current)
      current = ''
      index += 1
      continue
    }
    current += char
  }
  segments.push(current)
  return segments.map(segment => segment.trim()).filter(segment => segment.length > 0)
}

/** Split one command segment into tokens, removing surrounding quotes. */
export function shellTokens(segment: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let started = false
  for (const char of segment) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started || current.length > 0) tokens.push(current)
      current = ''
      started = false
      continue
    }
    current += char
    started = true
  }
  if (started || current.length > 0) tokens.push(current)
  return tokens
}

function stripWrappers(tokens: string[]): string[] {
  let index = 0
  for (;;) {
    const token = tokens[index]
    if (token === undefined) return []
    if (token === 'env') {
      index += 1
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? '')) index += 1
      continue
    }
    if (token === 'timeout' || token === 'command' || token === 'nohup') {
      index += 1
      if (token === 'timeout' && /^\d+[smhd]?$/.test(tokens[index] ?? '')) index += 1
      continue
    }
    if (token === 'uv' && tokens[index + 1] === 'run') {
      index += 2
      while ((tokens[index] ?? '').startsWith('-')) index += 1
      continue
    }
    if (token === 'python' || token === 'python3') {
      if (tokens[index + 1] === '-m') {
        const module = tokens[index + 2]
        if (module === 'science_agent' || module === 'science_agent.cli') {
          return tokens.slice(index + 3)
        }
        return []
      }
      return []
    }
    if ((token === 'bash' || token === 'sh' || token === 'zsh') && tokens[index + 1]?.startsWith('-')) {
      const flag = tokens[index + 1] ?? ''
      if (flag.includes('c')) {
        const inner = tokens[index + 2]
        return inner === undefined ? [] : shellTokens(inner)
      }
      return []
    }
    return tokens.slice(index)
  }
}

function parseSagent(tokens: string[]): SagentInvocation | undefined {
  const stripped = stripWrappers(tokens)
  const binaryIndex = stripped.findIndex((token) => {
    const binary = token.split(/[\\/]/).at(-1)
    return binary === 'sagent' || binary === 'sa' || binary === 'sagent.exe' || binary === 'sa.exe'
  })
  if (binaryIndex === -1) return undefined
  const invocationTokens = stripped.slice(binaryIndex + 1)
  let index = 0
  while (index < invocationTokens.length) {
    const token = invocationTokens[index] ?? ''
    if (token === '-w' || token === '--workspace' || token === '--dir') {
      index += 2
      continue
    }
    if (token.startsWith('--workspace=') || token.startsWith('--dir=')) {
      index += 1
      continue
    }
    if (token.startsWith('-')) {
      index += 1
      continue
    }
    break
  }
  const sub = invocationTokens.slice(index)
  if (sub.length === 0) return undefined
  return { sub, raw: sub.join(' ') }
}

/** Find every `sagent`/`sa` invocation in a shell command. */
export function sagentInvocations(command: string): SagentInvocation[] {
  const invocations: SagentInvocation[] = []
  for (const segment of splitShellCommands(command)) {
    const invocation = parseSagent(shellTokens(segment))
    if (invocation !== undefined) invocations.push(invocation)
  }
  return invocations
}

function optionValue(tokens: readonly string[], name: string): string | undefined {
  const index = tokens.indexOf(name)
  return index === -1 ? undefined : tokens[index + 1]
}

function classifySubcommand(sub: readonly string[]): ToolCallClassification | undefined {
  const [first, second] = sub
  if (first === undefined || IGNORED_SUBCOMMANDS.has(first)) return undefined
  if (first === 'round') {
    if (second === 'begin') {
      return {
        purpose: 'round-begin',
        stage: 'scout',
        role: 'orchestrator',
        agent: 'sagent',
        label: 'sagent round begin',
        mode: optionValue(sub, '--mode'),
        anchors: true,
      }
    }
    if (second === 'stage') {
      return {
        purpose: 'round-stage',
        role: 'orchestrator',
        agent: 'sagent',
        label: 'sagent round stage',
        stageName: sub[3],
        stageStatus: optionValue(sub, '--status') ?? 'running',
        anchors: false,
      }
    }
    if (second === 'end') {
      return {
        purpose: 'round-end',
        role: 'orchestrator',
        agent: 'sagent',
        label: 'sagent round end',
        anchors: false,
        roundOutcome: optionValue(sub, '--outcome'),
      }
    }
    if (second === 'close') {
      // `round close` decides, writes claims and the report, and ends the round;
      // its JSON result carries the computed outcome.
      return {
        purpose: 'round-end',
        stage: 'decide',
        role: 'orchestrator',
        agent: 'sagent',
        label: 'sagent round close',
        anchors: false,
      }
    }
    return undefined
  }
  if (first === 'decide') {
    return { purpose: 'decide', stage: 'decide', role: 'orchestrator', agent: 'sagent', label: 'sagent decide', anchors: true }
  }
  if (first === 'report') {
    return { purpose: 'report', stage: 'report', role: 'orchestrator', agent: 'sagent', label: 'sagent report', anchors: true }
  }
  if (first === 'verify') {
    if (second === 'design') {
      return {
        purpose: 'statistician',
        stage: 'statistician',
        role: 'sa-statistician',
        agent: 'sagent',
        label: 'sagent verify design',
        anchors: true,
      }
    }
    return { purpose: 'verifier', stage: 'verifier', role: 'sa-verifier', agent: 'sagent', label: 'sagent verify run', anchors: true }
  }
  if (first === 'run' && second === 'execute') {
    return { purpose: 'engineer', stage: 'engineer', role: 'sa-engineer', agent: 'sagent', label: 'sagent run execute', anchors: true }
  }
  if (first === 'data' && second === 'profile') {
    return { purpose: 'scout', stage: 'scout', role: 'sa-scout', agent: 'sagent', label: 'sagent data profile', anchors: true }
  }
  if (first === 'hypothesis' || first === 'experiment') {
    return {
      purpose: 'hypothesis',
      stage: 'hypotheses',
      role: 'sa-scout',
      agent: 'sagent',
      label: `sagent ${first}`,
      anchors: false,
    }
  }
  return undefined
}

function invocationRoundId(sub: readonly string[]): string | undefined {
  if (sub[0] === 'round' && (sub[1] === 'stage' || sub[1] === 'close')) return sub[2]
  return optionValue(sub, '--round')
}

function classifyMappedTool(name: string, args: Record<string, unknown> | undefined): ToolCallClassification[] {
  const action = stringField(args, 'action')
  if (name === 'sa_round') {
    if (action === 'begin') {
      return [{
        purpose: 'round-begin',
        stage: 'scout',
        role: 'orchestrator',
        agent: 'mcp',
        label: 'sa_round begin',
        mode: stringField(args, 'mode'),
        anchors: true,
      }]
    }
    if (action === 'stage') {
      return [{
        purpose: 'round-stage',
        role: 'orchestrator',
        agent: 'mcp',
        label: 'sa_round stage',
        stageName: stringField(args, 'stage'),
        stageStatus: stringField(args, 'status') ?? 'running',
        anchors: false,
      }]
    }
    if (action === 'end') {
      return [{
        purpose: 'round-end',
        role: 'orchestrator',
        agent: 'mcp',
        label: 'sa_round end',
        anchors: false,
        roundOutcome: stringField(args, 'outcome'),
      }]
    }
    if (action === 'close') {
      return [{
        purpose: 'round-end',
        stage: 'decide',
        role: 'orchestrator',
        agent: 'mcp',
        label: 'sa_round close',
        roundId: stringField(args, 'round_id'),
        anchors: false,
      }]
    }
    return []
  }
  if (name === 'sa_decide') {
    return [{ purpose: 'decide', stage: 'decide', role: 'orchestrator', agent: 'mcp', label: 'sa_decide', anchors: true }]
  }
  if (name === 'sa_report') {
    return [{ purpose: 'report', stage: 'report', role: 'orchestrator', agent: 'mcp', label: 'sa_report', anchors: true }]
  }
  if (name === 'sa_verify') {
    if (action === 'design') {
      return [{ purpose: 'statistician', stage: 'statistician', role: 'sa-statistician', agent: 'mcp', label: 'sa_verify design', anchors: true }]
    }
    return [{ purpose: 'verifier', stage: 'verifier', role: 'sa-verifier', agent: 'mcp', label: 'sa_verify run', anchors: true }]
  }
  if (name === 'sa_run') {
    if (action === 'execute') {
      return [{ purpose: 'engineer', stage: 'engineer', role: 'sa-engineer', agent: 'mcp', label: 'sa_run execute', anchors: true }]
    }
    return []
  }
  if (name === 'sa_hypothesis' || name === 'sa_experiment_write') {
    return [{ purpose: 'hypothesis', stage: 'hypotheses', role: 'sa-scout', agent: 'mcp', label: name, anchors: false }]
  }
  return []
}

/**
 * Classify one tool call into the loop work it performs.
 * @param name - tool name as recorded by `tool/call`.
 * @param argumentsJson - raw argument JSON string.
 * @returns one classification per unit of work; empty when unrelated.
 */
export function classifyToolCall(name: string, argumentsJson: string): ToolCallClassification[] {
  const direct = SA_DIRECT[name]
  if (direct !== undefined) {
    return [{
      purpose: direct.stage === 'report' ? 'report' : direct.stage === 'statistician' ? 'statistician' : direct.stage === 'verifier' ? 'verifier' : direct.stage === 'engineer' ? 'engineer' : direct.stage === 'scout' ? 'scout' : 'hypothesis',
      stage: direct.stage,
      role: direct.role,
      agent: name,
      label: name,
      anchors: true,
    }]
  }

  if (name.startsWith('mcp__science-agent__')) {
    const mapped = name.slice('mcp__science-agent__'.length)
    return classifyMappedTool(mapped, parseJsonObject(argumentsJson))
  }

  if (name === 'workflow' || name === 'workflow_run') {
    const args = parseJsonObject(argumentsJson)
    const scriptArgs = isRecord(args?.['args']) ? args['args'] : undefined
    const roundId = stringField(scriptArgs, 'roundId') ?? stringField(args, 'roundId')
    const mode = stringField(scriptArgs, 'mode') ?? stringField(args, 'mode')
    const meta = isRecord(args?.['meta']) ? args['meta'] : undefined
    const label = stringField(meta, 'name') ?? stringField(args, 'name') ?? 'kaggle-round'
    if (!SCIENCE_WORKFLOWS.has(label)) return []
    return [{ purpose: 'workflow', roundId, mode, role: 'workflow', agent: 'workflow', label, anchors: false }]
  }

  if (name === 'bash' || name === 'pwsh') {
    const args = parseJsonObject(argumentsJson)
    const command = stringField(args, 'command')
    if (command === undefined) return []
    const classifications: ToolCallClassification[] = []
    for (const invocation of sagentInvocations(command)) {
      const classification = classifySubcommand(invocation.sub)
      if (classification === undefined) continue
      classifications.push({
        ...classification,
        roundId: invocationRoundId(invocation.sub) ?? classification.roundId,
      })
    }
    return classifications
  }

  return []
}

/** Workflow names that drive a science-agent loop card. */
export const SCIENCE_WORKFLOWS: ReadonlySet<string> = new Set(['kaggle-round', 'science-round', 'science-campaign'])

/** Anchor id for a direct call candidate. */
export function callAnchorId(callId: string): string {
  return `call:${callId}`
}

/** Anchor id for a workflow run candidate. */
export function runAnchorId(runId: string): string {
  return `run:${runId}`
}
