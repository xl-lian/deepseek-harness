/**
 * Refresh `synced/` from a science-agent checkout for the research profile.
 *
 * science-agent owns the research-loop node prompts, the `science-research`
 * skill, the guard and round-trigger hooks, the MCP launcher, the example
 * research objective, and the `research-loop` workflow. This tool adapts them
 * to dsh: node personas gain the dsh runtime note; the workflow loses Claude
 * Code-only options and the `pattern` schema keyword, embeds every persona, and
 * narrates rounds for the loop view through `log()`, `artifact()`, and
 * `metric()`; the skill gains the dsh runtime section; the
 * guard matches dsh tool names and the trigger names the dsh `workflow` tool.
 * dsh-only text lives in `templates/`.
 *
 * Every adaptation anchors on exact source text and throws a
 * {@link SyncAnchorError} naming the anchor and file when the source changed.
 *
 * Usage: `pnpm run sync-science-research-bundle --source <science-agent checkout> [--check]`.
 * `--check` re-derives the output in memory and exits 1 when the committed
 * files differ.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  SyncAnchorError,
  adaptGuard,
  adaptRoundTrigger,
  buildPersonas,
  diffSynced,
  manifestFile,
  replaceAllRequired,
  replaceOnce,
  workflowMeta,
  writeSynced,
  type SyncedFile,
  type SyncedFiles,
} from '@deepseek-ai/dsh-experimental-science-agent-bundle/scripts/sync.ts'

/** Absolute directory of the research bundle package. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Package-relative directory that holds every synced file. */
export const SYNCED_DIR = 'synced'

/** The research-loop node agents, plus the clerk that runs single `sagent` commands. */
export const NODE_NAMES = [
  'research-experiment-build',
  'research-experiment-debug',
  'research-experiment-run',
  'research-next-step',
  'research-plan',
  'research-retrieve-read',
  'research-retrieve-refine',
  'research-retrieve-search',
  'research-validate-challenge',
  'research-validate-check',
  'research-validate-recheck',
  'research-write-up',
  'sa-clerk',
] as const

/** dsh-only text blocks read from `templates/`. */
export interface ResearchTemplates {
  /** Prefixed to every node persona. */
  readonly runtimeNote: string
  /** The dsh runtime section inserted into the research skill. */
  readonly skillRuntime: string
  /** Replaces the round trigger hook's model context. */
  readonly triggerContext: string
  /** Narration helpers inserted into the workflow ahead of the rounds. */
  readonly recordOutputs: string
}

/**
 * Read the dsh-only templates.
 * @param root - research bundle package directory.
 * @returns the template texts.
 */
export function readTemplates(root: string = PACKAGE_ROOT): ResearchTemplates {
  const read = (name: string): string => readFileSync(join(root, 'templates', name), 'utf8')
  return {
    runtimeNote: read('runtime-note.md'),
    skillRuntime: read('skill-runtime.md'),
    triggerContext: read('research-trigger-context.txt').trimEnd(),
    recordOutputs: read('loop-record-outputs.js'),
  }
}

/** Workflow result fields and labels the research loop view reads; a source edit that drops one breaks the view. */
const LOOP_VIEW_FIELDS = [
  'label: `r${R.number}-retrieve-search`',
  'label: `r${R.number}-read-${f.id}`',
  'label: `r${R.number}-plan`',
  'label: `r${R.number}-build-${e.id}`',
  'label: `r${R.number}-check-${e.id}`',
  'label: `r${R.number}-next-step`',
  "label: 'write-up'",
  'log(`Round ${R.number} (${R.round_id})',
  'experiments: results.map((r) => ({ id: r.id, status: r.status, verdict: r.verdict || null, confidence: r.confidence || null, unresolved: r.unresolved || []',
  'needs_human:',
  'registered_plan:',
  'report: report ? {',
] as const

/** Exact source edits: Claude Code-only agent options and schema keywords outside dsh's enforced subset. */
const OPTION_EDITS: readonly (readonly [string, string])[] = [
  ['  agentType: typeOf(`research-${name}`),\n', ''],
  ["  effort: opts.effort || 'high',\n", ''],
  [", agentType: typeOf('sa-clerk'), schema: SCHEMA.envelope, effort: 'low' })", ', schema: SCHEMA.envelope })'],
  ["id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_]{0,40}$' }", 'id: STR'],
]

/** Persona wrappers: each node and clerk prompt is prefixed by its embedded persona. */
const PERSONA_WRAPPERS: readonly (readonly [string, string])[] = [
  ['=> agent(`You are the research-${name} node', '=> agent(withPersona(`research-${name}`, `You are the research-${name} node'],
  ['Return only the structured result.`, {', 'Return only the structured result.`), {'],
  ['=> agent(`You are sa-clerk.', "=> agent(withPersona('sa-clerk', `You are sa-clerk."],
  ['Do not edit files. Do not run any other command.`, {', 'Do not edit files. Do not run any other command.`), {'],
]

/** Narration call sites; the helpers come from `templates/loop-record-outputs.js`. */
const RECORD_CALLS: readonly (readonly [string, string])[] = [
  ['    const retrieval = await retrieve(R)\n', '    const retrieval = await retrieve(R)\n    recordRetrieval(R, retrieval)\n'],
  // Before the per-invocation cap, so experiments it drops keep their titles and roles.
  ['    if (experiments.length > MAX_EXPERIMENTS) {\n', '    recordPlan(R, plan, experiments)\n    if (experiments.length > MAX_EXPERIMENTS) {\n'],
  [
    "      async (result, e) => { await save(R, e.id, 'Validate'); return result },",
    "      async (result, e) => { await save(R, e.id, 'Validate'); recordExperiment(R, e, result); return result },",
  ],
  ["    await save(R, 'next', 'Next step')\n", "    await save(R, 'next', 'Next step')\n    recordNext(R, decision, reason, next)\n"],
  ['\nreturn plain({\n', '\nif (last) recordWriteUp(last, report, stop)\n\nreturn plain({\n'],
]

const ROUNDS_MARKER = '// ---------------------------------------------------------------- rounds\n'
const NODES_MARKER = '// ---------------------------------------------------------------- calling nodes\n'

function personaBlock(personas: ReadonlyMap<string, string>): string {
  const lines = [...personas].map(([name, text]) => `  ${JSON.stringify(name)}: ${JSON.stringify(text)},`)
  return '// Each node persona is embedded here because the dsh workflow engine does not\n'
    + '// support Claude Code agent types. Synced by science-research-bundle/scripts/sync.ts.\n'
    + `const PERSONAS = {\n${lines.join('\n')}\n}\n`
    + "const withPersona = (name, prompt) => PERSONAS[name] + '\\n\\n---\\n\\n' + prompt\n\n"
}

/**
 * Adapt `plugin/workflows/research-loop.js` to the dsh workflow engine.
 * @param source - the workflow script text.
 * @param personas - persona name → text, one per {@link NODE_NAMES} entry.
 * @param recordOutputs - the narration helper template.
 * @returns `research-loop.js` and `research-loop.meta.json` → text.
 */
export function adaptResearchLoop(
  source: string,
  personas: ReadonlyMap<string, string>,
  recordOutputs: string,
): Map<string, string> {
  const file = 'plugin/workflows/research-loop.js'
  const meta = workflowMeta(source, file)
  for (const field of LOOP_VIEW_FIELDS) {
    if (!source.includes(field)) throw new SyncAnchorError(file, `loop view field ${JSON.stringify(field)} missing`)
  }
  let body = source.replace(/^export const meta = \{[\s\S]*?\n\}\n\n/, '')
  const typeOf = /^const typeOf = .*\n/m.exec(body)?.[0]
  if (typeOf === undefined) throw new SyncAnchorError(file, 'const typeOf = … line missing')
  body = replaceOnce(body, typeOf, '', file)
  for (const [anchor, replacement] of OPTION_EDITS) body = replaceOnce(body, anchor, replacement, file)
  for (const [anchor, replacement] of PERSONA_WRAPPERS) body = replaceAllRequired(body, anchor, replacement, file)
  for (const [anchor, replacement] of RECORD_CALLS) body = replaceOnce(body, anchor, replacement, file)
  body = replaceOnce(body, NODES_MARKER, personaBlock(personas) + NODES_MARKER, file)
  body = replaceOnce(body, ROUNDS_MARKER, `${recordOutputs}\n${ROUNDS_MARKER}`, file)
  for (const leftover of ['agentType', 'typeOf(', 'pattern:', 'type: [']) {
    if (body.includes(leftover)) throw new SyncAnchorError(file, `${JSON.stringify(leftover)} remains after adaptation`)
  }
  // Node call sites still pass `effort` inside node()'s own options; only a multi-line agent() option is fatal.
  if (/^\s*effort: /mu.test(body)) {
    throw new SyncAnchorError(file, 'an agent() effort option remains after adaptation')
  }
  return new Map([
    ['research-loop.js', body],
    ['research-loop.meta.json', `${JSON.stringify(meta, undefined, 2)}\n`],
  ])
}

/**
 * Adapt the research skill: dsh runtime section, example objective path, and the dsh launch fallback.
 * @param text - `plugin/skills/science-research/SKILL.md`.
 * @param templates - the dsh templates.
 * @returns the adapted text.
 */
export function adaptResearchSkill(text: string, templates: ResearchTemplates): string {
  const file = 'plugin/skills/science-research/SKILL.md'
  let out = replaceOnce(text, '## Non-negotiables\n', `${templates.skillRuntime}\n## Non-negotiables\n`, file)
  const fallback = /If the name is not registered, use `scriptPath:[\s\S]*?still-open round is reused\.\n/
  if (!fallback.test(out)) throw new SyncAnchorError(file, 'Claude Code launch fallback paragraph missing')
  out = out.replace(fallback, () => 'The script is saved in the profile and embeds every node prompt, so it needs no agent types or script path. A run that was interrupted resumes: the still-open round is reused.\n')
  out = replaceOnce(out, 'Write `objective.yaml` from `examples/objective.research.yaml`', 'Write `objective.yaml` from the example objective (`synced/examples/objective.research.yaml` under the bundle root)', file)
  return out.split('Without the Workflow tool').join('Without the `workflow` tool')
}

function text(value: string, mode?: number): SyncedFile {
  return mode === undefined ? { data: Buffer.from(value, 'utf8') } : { data: Buffer.from(value, 'utf8'), mode }
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** The derived files plus the hashes of every source file read. */
export interface ResearchSyncResult {
  /** Package-relative output path → file, including `synced/MANIFEST.json`. */
  readonly files: SyncedFiles
  /** Source-relative path → sha256 of each file read from the checkout. */
  readonly sources: ReadonlyMap<string, string>
}

/**
 * Derive every synced file from a science-agent checkout.
 * @param source - science-agent checkout directory.
 * @param templates - the dsh templates.
 * @returns the output files and source hashes.
 */
export function buildResearchSynced(source: string, templates: ResearchTemplates = readTemplates()): ResearchSyncResult {
  const sources = new Map<string, string>()
  const read = (path: string): string => {
    const absolute = join(source, path)
    if (!existsSync(absolute)) throw new SyncAnchorError(path, 'file missing')
    const value = readFileSync(absolute, 'utf8')
    sources.set(path, sha256(value))
    return value
  }
  const files: SyncedFiles = new Map()

  const agentFiles = new Set(readdirSync(join(source, 'plugin/agents')))
  const agents = new Map(NODE_NAMES.filter(name => agentFiles.has(`${name}.md`))
    .map(name => [`${name}.md`, read(`plugin/agents/${name}.md`)] as const))
  const personas = buildPersonas(agents, templates.runtimeNote, NODE_NAMES)
  for (const [name, persona] of personas) files.set(`${SYNCED_DIR}/personas/${name}.md`, text(`${persona}\n`))

  for (const [name, value] of adaptResearchLoop(read('plugin/workflows/research-loop.js'), personas, templates.recordOutputs)) {
    files.set(`${SYNCED_DIR}/workflows/${name}`, text(value))
  }
  files.set(`${SYNCED_DIR}/skills/science-research/SKILL.md`, text(adaptResearchSkill(read('plugin/skills/science-research/SKILL.md'), templates)))
  files.set(`${SYNCED_DIR}/examples/objective.research.yaml`, text(read('examples/objective.research.yaml')))
  files.set(`${SYNCED_DIR}/hooks/guard.py`, text(adaptGuard(read('plugin/hooks/guard.py'))))
  files.set(`${SYNCED_DIR}/hooks/round_trigger.py`, text(adaptRoundTrigger(read('plugin/hooks/round_trigger.py'), templates.triggerContext)))
  files.set(`${SYNCED_DIR}/scripts/mcp-server.sh`, text(read('plugin/scripts/mcp-server.sh'), 0o755))

  files.set(`${SYNCED_DIR}/MANIFEST.json`, manifestFile(read('pyproject.toml'), sources, files))
  return { files, sources }
}

function main(): void {
  const { values } = parseArgs({ options: { source: { type: 'string' }, check: { type: 'boolean', default: false } } })
  if (values.source === undefined) {
    process.stderr.write('usage: sync-science-research-bundle --source <science-agent checkout> [--check]\n')
    process.exit(2)
  }
  const { files } = buildResearchSynced(resolve(values.source))
  if (values.check) {
    const drift = diffSynced(files, PACKAGE_ROOT)
    if (drift.length > 0) {
      process.stderr.write(`synced science-agent research content is stale; rerun without --check:\n${drift.map(p => `  ${p}\n`).join('')}`)
      process.exit(1)
    }
    process.stdout.write(`synced science-agent research content is current (${files.size} files)\n`)
    return
  }
  writeSynced(files, PACKAGE_ROOT)
  process.stdout.write(`synced ${files.size} files into ${relative(process.cwd(), PACKAGE_ROOT) || '.'}\n`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
