/**
 * Refresh `synced/` from a science-agent checkout for the research profile.
 *
 * science-agent owns the research-loop and paper-writing node prompts, the
 * `science-research` and `science-paper` skills, the guard and round-trigger
 * hooks, the MCP launcher, the example research objective, and the
 * `research-loop` and `paper-writing` workflows; `scripts/campaign-sync.ts`
 * adds the campaign roles, skills, and workflows. This tool adapts them to dsh:
 * node personas gain a dsh runtime note; each workflow loses Claude Code-only
 * options and embeds every persona it calls; the research loop also loses the
 * `pattern` schema keyword and narrates rounds for the loop view through
 * `log()`, `artifact()`, and `metric()` (the paper workflow narrates itself);
 * each skill gains its dsh runtime section; the guard matches dsh tool names
 * and the trigger names the dsh `workflow` tool. dsh-only text lives in
 * `templates/`.
 *
 * Every adaptation anchors on exact source text and throws a
 * {@link SyncAnchorError} naming the anchor and file when the source changed.
 *
 * Usage: `pnpm run sync-science-research-bundle --source <science-agent checkout> [--check]`.
 * `--check` re-derives the output in memory and exits 1 when the committed
 * files differ.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  SyncAnchorError,
  assertPersonaOnEveryAgent,
  adaptGuard,
  buildCampaignAssets,
  adaptRoundTrigger,
  buildPersonas,
  diffSynced,
  manifestFile,
  replaceAllRequired,
  replaceOnce,
  sha256,
  text,
  workflowMeta,
  writeSynced,
  type SyncedFiles,
} from './campaign-sync.ts'

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

/** The paper-writing node agents; the clerk is shared with the research loop. */
export const PAPER_NODE_NAMES = [
  'paper-audit',
  'paper-fix',
  'paper-item',
  'paper-outline',
  'paper-references',
  'paper-review',
  'paper-revise',
  'paper-section',
  'sa-clerk',
] as const

/** dsh-only text blocks read from `templates/`. */
export interface ResearchTemplates {
  /** Prefixed to every research-loop node persona. */
  readonly runtimeNote: string
  /** Prefixed to every paper-writing node persona. */
  readonly paperRuntimeNote: string
  /** The dsh runtime section inserted into the research skill. */
  readonly skillRuntime: string
  /** The dsh runtime section inserted into the paper skill. */
  readonly paperSkillRuntime: string
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
    paperRuntimeNote: read('paper-runtime-note.md'),
    skillRuntime: read('skill-runtime.md'),
    paperSkillRuntime: read('paper-skill-runtime.md'),
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

type Edits = readonly (readonly [string, string])[]

/** Exact source edits that drop Claude Code-only agent options from a workflow whose nodes are `<prefix>-<name>`. */
function optionEdits(prefix: string): Edits {
  return [
    [`  agentType: typeOf(\`${prefix}-\${name}\`),\n`, ''],
    ["  effort: opts.effort || 'high',\n", ''],
    [", agentType: typeOf('sa-clerk'), schema: SCHEMA.envelope, effort: 'low', ...route('clerk') })", ", schema: SCHEMA.envelope, ...route('clerk') })"],
  ]
}

/** Persona wrappers: each node and clerk prompt of a `<prefix>-<name>` workflow is prefixed by its embedded persona. */
function personaWrappers(prefix: string): Edits {
  return [
    [`=> agent(\`You are the ${prefix}-\${name} node`, `=> agent(withPersona(\`${prefix}-\${name}\`, \`You are the ${prefix}-\${name} node`],
    ['Return only the structured result.`, {', 'Return only the structured result.`), {'],
    ['=> agent(`You are sa-clerk.', "=> agent(withPersona('sa-clerk', `You are sa-clerk."],
    ['Do not edit files. Do not run any other command.`, {', 'Do not edit files. Do not run any other command.`), {'],
  ]
}

/** Research-loop schema keywords outside dsh's enforced subset. */
const SCHEMA_EDITS: Edits = [
  ["id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_]{0,40}$' }", 'id: STR'],
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

/** What one workflow's adaptation needs beyond the shared steps. */
interface WorkflowAdaptation {
  /** Source file, relative to the checkout. */
  readonly file: string
  /** Saved workflow name, which names the output files. */
  readonly name: string
  /** Node agent prefix: `research` or `paper`. */
  readonly prefix: string
  /** Source text the Notebook view depends on; a missing one fails the sync. */
  readonly viewFields: readonly string[]
  /** Further exact edits applied once each, after the options are dropped. */
  readonly edits: Edits
}

/**
 * Adapt a science-agent workflow to the dsh workflow engine: drop the `meta`
 * export and the agent-type options, wrap every node and clerk prompt in its
 * embedded persona, and apply the workflow's own edits.
 * @param source - the workflow script text.
 * @param personas - persona name → text for every agent the script calls.
 * @param spec - the workflow's adaptation.
 * @returns `<name>.js` and `<name>.meta.json` → text.
 */
function adaptWorkflow(source: string, personas: ReadonlyMap<string, string>, spec: WorkflowAdaptation): Map<string, string> {
  const { file } = spec
  const meta = workflowMeta(source, file)
  for (const field of spec.viewFields) {
    if (!source.includes(field)) throw new SyncAnchorError(file, `loop view field ${JSON.stringify(field)} missing`)
  }
  let body = source.replace(/^export const meta = \{[\s\S]*?\n\}\n\n/, '')
  const typeOf = /^const typeOf = .*\n/m.exec(body)?.[0]
  if (typeOf === undefined) throw new SyncAnchorError(file, 'const typeOf = … line missing')
  body = replaceOnce(body, typeOf, '', file)
  for (const [anchor, replacement] of optionEdits(spec.prefix)) body = replaceOnce(body, anchor, replacement, file)
  for (const [anchor, replacement] of personaWrappers(spec.prefix)) body = replaceAllRequired(body, anchor, replacement, file)
  for (const [anchor, replacement] of spec.edits) body = replaceOnce(body, anchor, replacement, file)
  body = replaceOnce(body, NODES_MARKER, personaBlock(personas) + NODES_MARKER, file)
  for (const leftover of ['agentType', 'typeOf(', 'pattern:', 'type: [']) {
    if (body.includes(leftover)) throw new SyncAnchorError(file, `${JSON.stringify(leftover)} remains after adaptation`)
  }
  // Node call sites still pass `effort` inside node()'s own options; only a multi-line agent() option is fatal.
  if (/^\s*effort: /mu.test(body)) {
    throw new SyncAnchorError(file, 'an agent() effort option remains after adaptation')
  }
  assertPersonaOnEveryAgent(body, file)
  return new Map([
    [`${spec.name}.js`, body],
    [`${spec.name}.meta.json`, `${JSON.stringify(meta, undefined, 2)}\n`],
  ])
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
  return adaptWorkflow(source, personas, {
    file: 'plugin/workflows/research-loop.js',
    name: 'research-loop',
    prefix: 'research',
    viewFields: LOOP_VIEW_FIELDS,
    edits: [...SCHEMA_EDITS, ...RECORD_CALLS, [ROUNDS_MARKER, `${recordOutputs}\n${ROUNDS_MARKER}`]],
  })
}

/** Narration lines and result fields of the paper workflow that the Notebook view reads. */
const PAPER_VIEW_FIELDS = [
  "label: 'paper-outline'",
  'label: `paper-item-${it.id}`',
  'label: `paper-section-${id}`',
  'label: `paper-audit-${pass}`',
  'label: `paper-revise-${part}-${revisions}`',
  'log(`Paper: ',
  'log(`Paper references: ',
  'log(`Paper item ${it.id}: ',
  'log(`Paper section ${id}: ',
  'log(`Paper audit pass ${pass}: ',
  'log(`Paper review: ',
  'log(`Paper revise pass ${revisions}: ',
  'log(`Paper compile: ok · ',
  'log(`Paper compile: skipped — ',
  'log(`Paper compile: failed — ',
  'log(`Paper stopped: ',
  'open: open.slice(0, 20),',
] as const

/**
 * Adapt `plugin/workflows/paper-writing.js` to the dsh workflow engine.
 * @param source - the workflow script text.
 * @param personas - persona name → text, one per {@link PAPER_NODE_NAMES} entry.
 * @returns `paper-writing.js` and `paper-writing.meta.json` → text.
 */
export function adaptPaperWorkflow(source: string, personas: ReadonlyMap<string, string>): Map<string, string> {
  return adaptWorkflow(source, personas, {
    file: 'plugin/workflows/paper-writing.js',
    name: 'paper-writing',
    prefix: 'paper',
    viewFields: PAPER_VIEW_FIELDS,
    edits: [],
  })
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

/**
 * Adapt the paper skill: dsh runtime section and the dsh launch fallback.
 * @param text - `plugin/skills/science-paper/SKILL.md`.
 * @param templates - the dsh templates.
 * @returns the adapted text.
 */
export function adaptPaperSkill(text: string, templates: ResearchTemplates): string {
  const file = 'plugin/skills/science-paper/SKILL.md'
  let out = replaceOnce(text, '## Non-negotiables\n', `${templates.paperSkillRuntime}\n## Non-negotiables\n`, file)
  const fallback = /If the name is not registered, use `scriptPath:[\s\S]*?rewrites what its nodes are asked to write\.\n/
  if (!fallback.test(out)) throw new SyncAnchorError(file, 'Claude Code launch fallback paragraph missing')
  out = out.replace(fallback, () => 'The script is saved in the profile and embeds every node prompt, so it needs no agent types or script path. A rerun keeps every file under `paper/` that exists and rewrites what its nodes are asked to write.\n')
  return out.split('Without the Workflow tool').join('Without the `workflow` tool')
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
  const agentsOf = (names: readonly string[]): Map<string, string> => new Map(names.filter(name => agentFiles.has(`${name}.md`))
    .map(name => [`${name}.md`, read(`plugin/agents/${name}.md`)] as const))
  const personas = buildPersonas(agentsOf(NODE_NAMES), templates.runtimeNote, NODE_NAMES)
  for (const [name, persona] of personas) files.set(`${SYNCED_DIR}/personas/${name}.md`, text(`${persona}\n`))
  // The paper workflow embeds its own clerk persona, prefixed by the paper runtime note.
  const paperPersonas = buildPersonas(agentsOf(PAPER_NODE_NAMES), templates.paperRuntimeNote, PAPER_NODE_NAMES)
  for (const [name, persona] of paperPersonas) {
    if (name.startsWith('paper-')) files.set(`${SYNCED_DIR}/personas/${name}.md`, text(`${persona}\n`))
  }

  for (const [name, value] of adaptResearchLoop(read('plugin/workflows/research-loop.js'), personas, templates.recordOutputs)) {
    files.set(`${SYNCED_DIR}/workflows/${name}`, text(value))
  }
  for (const [name, value] of adaptPaperWorkflow(read('plugin/workflows/paper-writing.js'), paperPersonas)) {
    files.set(`${SYNCED_DIR}/workflows/${name}`, text(value))
  }
  files.set(`${SYNCED_DIR}/skills/science-research/SKILL.md`, text(adaptResearchSkill(read('plugin/skills/science-research/SKILL.md'), templates)))
  files.set(`${SYNCED_DIR}/skills/science-paper/SKILL.md`, text(adaptPaperSkill(read('plugin/skills/science-paper/SKILL.md'), templates)))
  files.set(`${SYNCED_DIR}/examples/objective.research.yaml`, text(read('examples/objective.research.yaml')))
  files.set(`${SYNCED_DIR}/hooks/guard.py`, text(adaptGuard(read('plugin/hooks/guard.py'))))
  files.set(`${SYNCED_DIR}/hooks/round_trigger.py`, text(adaptRoundTrigger(read('plugin/hooks/round_trigger.py'))))
  for (const [path, file] of buildCampaignAssets(source, read)) files.set(path, file)
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
