/**
 * Campaign half of the `synced/` refresh, plus the helpers both halves share.
 *
 * science-agent owns the campaign role prompts, the `science-agent` and
 * `science-agent-kaggle` skills, and the `science-round` and `science-campaign`
 * workflows. {@link buildCampaignAssets} adapts them to dsh: role personas gain
 * the campaign runtime note, workflows lose Claude Code-only options, embed
 * each role persona, inline the round into the campaign, and record round
 * metrics and report artifacts; skills gain the dsh runtime section and
 * `/sa-*` command names. `scripts/sync.ts` calls it and writes the result with
 * the research and paper assets. dsh-only text lives in `templates/`.
 *
 * Every adaptation anchors on exact source text and throws a
 * {@link SyncAnchorError} naming the anchor and file when the source changed.
 */

import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute directory of the bundle package. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Package-relative directory that holds every synced file except the test fixture. */
export const SYNCED_DIR = 'synced'

/** Package-relative path of the domain-pack fixture the workflow tests run against. */
export const FIXTURE_PATH = 'tests/fixtures/science-agent/predictive.json'

/** The role agents the campaign workflows require, by persona name. */
export const ROLE_NAMES = ['sa-clerk', 'sa-engineer', 'sa-hypothesis', 'sa-reporter', 'sa-scout', 'sa-statistician', 'sa-verifier'] as const

/** The roles with their own Agent preset and delegation tool; the clerk runs only inside workflows. */
export const ROLE_PRESET_NAMES = ['sa-engineer', 'sa-hypothesis', 'sa-reporter', 'sa-scout', 'sa-statistician', 'sa-verifier'] as const

/** A source file no longer contains the exact text an adaptation step depends on. */
export class SyncAnchorError extends Error {
  /**
   * @param file - source-relative path of the file being adapted.
   * @param anchor - the missing or ambiguous text, or a description of the failed check.
   */
  constructor(readonly file: string, readonly anchor: string) {
    super(`science-agent source changed: ${file}: ${anchor}`)
    this.name = 'SyncAnchorError'
  }
}

/** dsh-only campaign text blocks read from `templates/`. */
export interface CampaignTemplates {
  /** Appended to every role persona ahead of its body. */
  readonly runtimeNote: string
  /** The dsh runtime section inserted into both campaign skills. */
  readonly skillRuntime: string
  /** Replaces the Kaggle skill's Claude Code campaign-launch step. */
  readonly campaignLaunch: string
  /** Inserted into the campaign before each round's report check. */
  readonly recordOutputs: string
}

/** One output file: package-relative path, content, and POSIX mode. */
export interface SyncedFile {
  /** Content bytes. */
  readonly data: Buffer
  /** Executable bit for scripts; omitted means 0o644. */
  readonly mode?: number
}

/** Package-relative output path → file. */
export type SyncedFiles = Map<string, SyncedFile>

/**
 * Read the dsh-only campaign templates.
 * @param root - bundle package directory.
 * @returns the template texts.
 */
export function readCampaignTemplates(root: string = PACKAGE_ROOT): CampaignTemplates {
  const read = (name: string): string => readFileSync(join(root, 'templates', name), 'utf8')
  return {
    runtimeNote: read('campaign-runtime-note.md'),
    skillRuntime: read('campaign-skill-runtime.md'),
    campaignLaunch: read('skill-campaign-launch.md'),
    recordOutputs: read('campaign-record-outputs.js'),
  }
}

/**
 * Replace the single occurrence of `anchor`.
 * @param text - source text.
 * @param anchor - exact text that must occur exactly once.
 * @param replacement - text that takes its place.
 * @param file - source-relative path for diagnostics.
 * @returns the edited text.
 */
export function replaceOnce(text: string, anchor: string, replacement: string, file: string): string {
  const first = text.indexOf(anchor)
  if (first === -1) throw new SyncAnchorError(file, `missing ${JSON.stringify(anchor)}`)
  if (text.indexOf(anchor, first + 1) !== -1) throw new SyncAnchorError(file, `ambiguous ${JSON.stringify(anchor)}`)
  return text.slice(0, first) + replacement + text.slice(first + anchor.length)
}

/**
 * Replace every occurrence of `anchor`, which must occur at least once.
 * @param text - source text.
 * @param anchor - exact text that must occur.
 * @param replacement - text that takes each occurrence's place.
 * @param file - source-relative path for diagnostics.
 * @returns the edited text.
 */
export function replaceAllRequired(text: string, anchor: string, replacement: string, file: string): string {
  if (!text.includes(anchor)) throw new SyncAnchorError(file, `missing ${JSON.stringify(anchor)}`)
  return text.split(anchor).join(replacement)
}

/**
 * Build each role persona: the dsh runtime note followed by the agent body without front matter.
 * @param agents - agent file name (`sa-scout.md`) → file text.
 * @param runtimeNote - the runtime note template.
 * @param required - persona names that must be present.
 * @returns persona name → persona text, sorted by name.
 */
export function buildPersonas(
  agents: ReadonlyMap<string, string>,
  runtimeNote: string,
  required: readonly string[] = ROLE_NAMES,
): Map<string, string> {
  const personas = new Map<string, string>()
  for (const [fileName, text] of [...agents].sort(([a], [b]) => a.localeCompare(b))) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
    let name = fileName.replace(/\.md$/u, '')
    let body = text
    if (match) {
      body = text.slice(match[0].length)
      for (const line of match[1]!.split('\n')) {
        const colon = line.indexOf(':')
        if (colon !== -1 && line.slice(0, colon).trim() === 'name') name = line.slice(colon + 1).trim() || name
      }
    }
    personas.set(name, `${runtimeNote}\n\n${body.trim()}`)
  }
  const missing = required.filter(role => !personas.has(role))
  if (missing.length > 0) throw new SyncAnchorError('plugin/agents', `missing agent definitions ${missing.join(', ')}`)
  return new Map([...personas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** The saved-workflow metadata extracted from a script's `export const meta` literal. */
export interface WorkflowMeta {
  /** Workflow name. */
  readonly name: string
  /** One-line description. */
  readonly description: string
  /** When the model should launch it. */
  readonly whenToUse: string
  /** Phase titles and details in order. */
  readonly phases: readonly { readonly title: string; readonly detail: string }[]
}

/**
 * Read name, description, whenToUse, and phases from a workflow's pure-literal meta block.
 * @param source - workflow script text.
 * @param file - source-relative path for diagnostics.
 * @returns the metadata.
 */
export function workflowMeta(source: string, file: string): WorkflowMeta {
  const block = /^export const meta = \{([\s\S]*?)\n\}\n/.exec(source)?.[1]
  if (block === undefined) throw new SyncAnchorError(file, 'export const meta block missing')
  const name = /name:\s*'([^']+)'/.exec(block)?.[1]
  const phases = [...block.matchAll(/\{ title: '([^']+)', detail: '([^']*)' \}/g)].map(m => ({ title: m[1]!, detail: m[2]! }))
  if (name === undefined || phases.length === 0) throw new SyncAnchorError(file, 'meta must name the workflow and list phases')
  return {
    name,
    description: /description:\s*\n?\s*'([^']+)'/.exec(block)?.[1] ?? '',
    whenToUse: /whenToUse:\s*\n?\s*'([^']+)'/.exec(block)?.[1] ?? '',
    phases,
  }
}

/**
 * Strip Claude Code-only constructs: the meta export, `agentType`, and `effort`.
 * @param source - workflow script text.
 * @param file - source-relative path for diagnostics.
 * @returns the script body dsh runs.
 */
export function dshWorkflowBody(source: string, file: string): string {
  let body = source.replace(/^export const meta = \{[\s\S]*?\n\}\n\n/, '')
  body = body.replace(/^const typeOf = .*\n/m, '')
  body = body.replace(/^\s*agentType: typeOf\([^\n]*\),\n/gm, '')
  body = body.replace(/^\s*effort: '[^']*',\n/gm, '')
  if (body.includes('type: [')) throw new SyncAnchorError(file, "JSON Schema type arrays (`type: [`) are outside dsh's enforced subset")
  if (body.includes('typeOf(') || body.includes('effort:')) throw new SyncAnchorError(file, 'agentType/effort remain after adaptation')
  return body
}

const ROUND_WRAPPERS: readonly (readonly [string, string])[] = [
  ['agent(scoutPrompt(), {', "agent(withPersona('sa-scout', scoutPrompt()), {"],
  ['agent(debugPrompt(scout), {', "agent(withPersona('sa-hypothesis', debugPrompt(scout)), {"],
  ['agent(hypothesisPrompt(scout, lens, i), {', "agent(withPersona('sa-hypothesis', hypothesisPrompt(scout, lens, i)), {"],
  ['agent(confirmPrompt(h), {', "agent(withPersona('sa-engineer', confirmPrompt(h)), {"],
  ['agent(engineerPrompt(h), {', "agent(withPersona('sa-engineer', engineerPrompt(h)), {"],
  ['agent(verifyPrompt(h, r), {', "agent(withPersona('sa-verifier', verifyPrompt(h, r)), {"],
  ['agent(repairPrompt(h, v), {', "agent(withPersona('sa-engineer', repairPrompt(h, v)), {"],
  ['agent(l3Prompt(results), {', "agent(withPersona('sa-statistician', l3Prompt(results)), {"],
  ['=> agent(`You are sa-clerk.', "=> agent(withPersona('sa-clerk', `You are sa-clerk."],
  ['Do not edit files. Do not run any other command.`, {', 'Do not edit files. Do not run any other command.`), {'],
]

const CAMPAIGN_WRAPPERS: readonly (readonly [string, string])[] = [
  ['=> agent(`You are sa-clerk.', "=> agent(withPersona('sa-clerk', `You are sa-clerk."],
  ['Do not edit files. Do not run any other command.`, {', 'Do not edit files. Do not run any other command.`), {'],
  ['=> agent(`You are sa-reporter.', "=> agent(withPersona('sa-reporter', `You are sa-reporter."],
  ['next_action (the controller\'s next action or "stop").`, {', 'next_action (the controller\'s next action or "stop").`), {'],
]

/** Workflow result fields the loop view reads; a source edit that drops one breaks the view. */
const LOOP_VIEW_FIELDS = [
  'falsifiable_prediction',
  "plan: { type: 'string' }",
  'metrics_verified',
  'checks: {',
  'hypothesis_id: item.hypothesis_id',
  'engineer: engineer ?? null',
  'tokenDelta:',
] as const

const RECORD_MARKER = '    if (!c.report || !c.report.strict_ok) log('
const INLINED_COMMENT = '// <runRound> inlined science-round body (dsh workflows cannot nest).\n'

function wrapAll(source: string, wrappers: readonly (readonly [string, string])[], file: string): string {
  return wrappers.reduce((text, [anchor, replacement]) => replaceAllRequired(text, anchor, replacement, file), source)
}

function personaBlock(personas: ReadonlyMap<string, string>): string {
  const lines = [...personas].map(([name, text]) => `  ${JSON.stringify(name)}: ${JSON.stringify(text)},`)
  return '// Each role persona is embedded here because the dsh workflow engine does not\n'
    + '// support Claude Code\'s agentType option. Synced by science-research-bundle/scripts/campaign-sync.ts.\n'
    + `const PERSONAS = {\n${lines.join('\n')}\n}\n`
    + "const withPersona = (name, prompt) => PERSONAS[name] + '\\n\\n---\\n\\n' + prompt\n\n"
}

function metaJson(meta: WorkflowMeta): string {
  return `${JSON.stringify(meta, undefined, 2)}\n`
}

/**
 * Adapt the round and campaign workflows; the campaign carries the round body inline.
 * @param roundSource - `plugin/workflows/science-round.js`.
 * @param campaignSource - `plugin/workflows/science-campaign.js`.
 * @param personas - persona name → text.
 * @param recordOutputs - the metric/artifact block template.
 * @returns `<name>.js` / `<name>.meta.json` → text, for science-round, science-campaign, and kaggle-round.
 */
export function adaptWorkflows(
  roundSource: string,
  campaignSource: string,
  personas: ReadonlyMap<string, string>,
  recordOutputs: string,
): Map<string, string> {
  const roundFile = 'plugin/workflows/science-round.js'
  const campaignFile = 'plugin/workflows/science-campaign.js'
  const roundMeta = workflowMeta(roundSource, roundFile)
  const campaignMeta = workflowMeta(campaignSource, campaignFile)

  const roundBody = wrapAll(dshWorkflowBody(roundSource, roundFile), ROUND_WRAPPERS, roundFile)
  const roundStandalone = replaceOnce(roundBody, 'const CLERK_OBJECT = {', `${personaBlock(personas)}const CLERK_OBJECT = {`, roundFile)
  for (const field of LOOP_VIEW_FIELDS) {
    if (!roundStandalone.includes(field)) throw new SyncAnchorError(roundFile, `loop view field ${JSON.stringify(field)} missing`)
  }

  let campaign = wrapAll(dshWorkflowBody(campaignSource, campaignFile), CAMPAIGN_WRAPPERS, campaignFile)
  campaign = replaceOnce(campaign, '\nconst CLERK_OBJECT = ', `\n${personaBlock(personas)}const CLERK_OBJECT = `, campaignFile)
  const block = /\/\/ <runRound>[\s\S]*?\/\/ <\/runRound>\n/.exec(campaign)
  if (block === null) throw new SyncAnchorError(campaignFile, '<runRound> … </runRound> block missing')
  const inlined = INLINED_COMMENT
    + 'const runRoundBody = async (args) => {\n'
    + roundBody
    + '\n}\n'
    + 'const runRound = async (args) => {\n'
    + '  try {\n'
    + '    return await runRoundBody(args)\n'
    + '  } catch (error) {\n'
    + "    return { started: false, reason: 'round-crashed', error: String(error && error.message ? error.message : error).slice(0, 400) }\n"
    + '  }\n'
    + '}\n// </runRound>\n'
  campaign = campaign.slice(0, block.index) + inlined + campaign.slice(block.index + block[0].length)
  if (!campaign.split('// <runRound>')[0]!.includes('withPersona = ')) {
    throw new SyncAnchorError(campaignFile, 'personas must be defined before the inlined round')
  }
  if (campaign.replace(INLINED_COMMENT, '').includes('workflow(')) {
    throw new SyncAnchorError(campaignFile, 'campaign still calls workflow(); the round must be inlined')
  }
  campaign = replaceOnce(campaign, RECORD_MARKER, recordOutputs + RECORD_MARKER, campaignFile)

  return new Map([
    ['science-round.js', roundStandalone],
    ['science-round.meta.json', metaJson(roundMeta)],
    ['science-campaign.js', campaign],
    ['science-campaign.meta.json', metaJson(campaignMeta)],
    ['kaggle-round.js', roundStandalone],
    ['kaggle-round.meta.json', metaJson({ ...roundMeta, name: 'kaggle-round' })],
  ])
}

const COMMAND_NAMES = ['kaggle', 'campaign', 'round', 'verify', 'submit', 'report', 'status', 'doctor', 'research', 'paper'] as const

function dshCommandNames(text: string): string {
  return COMMAND_NAMES.reduce((out, name) => out.split(`/science-agent:${name}`).join(`/sa-${name}`), text)
}

/**
 * Adapt the Kaggle skill's SKILL.md: dsh runtime section, saved-workflow launch step, command names.
 * @param text - source SKILL.md.
 * @param templates - the dsh templates.
 * @returns the adapted text.
 */
export function adaptKaggleSkill(text: string, templates: CampaignTemplates): string {
  const file = 'plugin/skills/science-agent-kaggle/SKILL.md'
  const intro = 'The full architecture and rationale live in `references/`. Load only the reference you need.\n'
  let out = replaceOnce(text, intro, `${intro}\n${templates.skillRuntime}`, file)
  const launch = /2\. \*\*Launch the campaign\*\*[\s\S]*?multi-agent sequence\.\n/
  if (!launch.test(out)) throw new SyncAnchorError(file, 'campaign launch step missing')
  out = out.replace(launch, () => templates.campaignLaunch)
  out = out.split('The Workflow tool is unavailable').join('The workflow tool is unavailable')
  out = out.split('Workflow call').join('workflow call')
  return dshCommandNames(out)
}

/**
 * Adapt the domain-general skill's SKILL.md: dsh runtime section and command names.
 * @param text - source SKILL.md.
 * @param templates - the dsh templates.
 * @returns the adapted text.
 */
export function adaptGeneralSkill(text: string, templates: CampaignTemplates): string {
  const anchor = '## Non-negotiables\n'
  return dshCommandNames(replaceOnce(text, anchor, `${templates.skillRuntime}\n${anchor}`, 'plugin/skills/science-agent/SKILL.md'))
}

/**
 * Make the guard hook match dsh's lower-case tool names.
 * @param text - `plugin/hooks/guard.py`.
 * @returns the adapted script.
 */
export function adaptGuard(text: string): string {
  const file = 'plugin/hooks/guard.py'
  let out = replaceOnce(text, '    tool = payload.get("tool_name") or payload.get("tool")\n',
    '    tool = str(payload.get("tool_name") or payload.get("tool") or "").lower()\n', file)
  out = replaceOnce(out, '    if tool in {"Write", "Edit", "MultiEdit"}:\n', '    if tool in {"write", "edit", "multiedit"}:\n', file)
  return replaceOnce(out, '    if tool == "Bash":\n', '    if tool == "bash":\n', file)
}

/**
 * Make the round trigger name the dsh `workflow` tool and its saved workflow names; its routing text stays upstream's.
 * @param text - `plugin/hooks/round_trigger.py`.
 * @returns the adapted script.
 */
export function adaptRoundTrigger(text: string): string {
  const file = 'plugin/hooks/round_trigger.py'
  const out = replaceAllRequired(text, 'Workflow({name: \\"science-agent:', 'the dsh `workflow` tool with ({name: \\"', file)
  if (out.includes('science-agent:')) throw new SyncAnchorError(file, 'a Claude Code workflow or command name remains')
  for (const literal of ['CONTEXT = (', 'NO_WORKSPACE_CONTEXT = (']) {
    if (!out.includes(literal)) throw new SyncAnchorError(file, `${literal} … ) literal missing`)
  }
  return out
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])
    .sort()
}

/**
 * One UTF-8 output file.
 * @param value - file text.
 * @param mode - POSIX mode for an executable script.
 * @returns the file.
 */
export function text(value: string, mode?: number): SyncedFile {
  return mode === undefined ? { data: Buffer.from(value, 'utf8') } : { data: Buffer.from(value, 'utf8'), mode }
}

/** Computes the sha256 of a file's content. */
export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Derive the campaign files: the six role personas, the campaign and round workflows, the
 * `science-agent` and `science-agent-kaggle` skills, and the workflow test fixture.
 * @param source - science-agent checkout directory, for listing agents and skill files.
 * @param read - reads one source-relative file and records its hash in the manifest.
 * @param templates - the campaign templates.
 * @returns package-relative output path → file.
 */
export function buildCampaignAssets(
  source: string,
  read: (path: string) => string,
  templates: CampaignTemplates = readCampaignTemplates(),
): SyncedFiles {
  const files: SyncedFiles = new Map()
  const agents = new Map(ROLE_NAMES.map(name => [`${name}.md`, read(`plugin/agents/${name}.md`)] as const))
  const personas = buildPersonas(agents, templates.runtimeNote)
  // The clerk persona file belongs to the research loop; campaign workflows embed their own clerk.
  for (const name of ROLE_PRESET_NAMES) files.set(`${SYNCED_DIR}/personas/${name}.md`, text(`${personas.get(name)}\n`))

  const workflows = adaptWorkflows(
    read('plugin/workflows/science-round.js'),
    read('plugin/workflows/science-campaign.js'),
    personas,
    templates.recordOutputs,
  )
  for (const [name, value] of workflows) files.set(`${SYNCED_DIR}/workflows/${name}`, text(value))

  for (const skill of ['science-agent', 'science-agent-kaggle']) {
    const skillRoot = join(source, 'plugin/skills', skill)
    if (!existsSync(skillRoot)) throw new SyncAnchorError(`plugin/skills/${skill}`, 'directory missing')
    for (const absolute of walk(skillRoot)) {
      const path = relative(source, absolute).split(sep).join('/')
      const value = read(path)
      const inner = relative(skillRoot, absolute).split(sep).join('/')
      const adapted = inner !== 'SKILL.md' ? value
        : skill === 'science-agent' ? adaptGeneralSkill(value, templates) : adaptKaggleSkill(value, templates)
      files.set(`${SYNCED_DIR}/skills/${skill}/${inner}`, text(adapted))
    }
  }
  files.set(FIXTURE_PATH, text(read('src/science_agent/domains/predictive.json')))
  return files
}

/**
 * Build `synced/MANIFEST.json`: the science-agent version and the sha256 of every source read and file written.
 * @param pyproject - science-agent `pyproject.toml` text.
 * @param sources - source-relative path → sha256 of each file read.
 * @param files - every derived file except the manifest.
 * @returns the manifest file.
 */
export function manifestFile(pyproject: string, sources: ReadonlyMap<string, string>, files: SyncedFiles): SyncedFile {
  const version = /^version\s*=\s*"([^"]+)"/m.exec(pyproject)?.[1]
  if (version === undefined) throw new SyncAnchorError('pyproject.toml', 'version missing')
  const manifest = {
    sourceVersion: version,
    sources: Object.fromEntries([...sources].sort(([a], [b]) => (a < b ? -1 : 1))),
    files: Object.fromEntries([...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, file]) => [path, sha256(file.data)])),
  }
  return text(`${JSON.stringify(manifest, undefined, 2)}\n`)
}

/**
 * List the paths whose committed content or mode differs from `files`, plus extra files under `synced/`.
 * @param files - derived files.
 * @param root - bundle package directory.
 * @returns package-relative paths that drifted, sorted.
 */
export function diffSynced(files: SyncedFiles, root: string = PACKAGE_ROOT): string[] {
  const drift = new Set<string>()
  for (const [path, file] of files) {
    const absolute = join(root, path)
    const current = existsSync(absolute)
      && readFileSync(absolute).equals(file.data)
      && (file.mode === undefined || (statSync(absolute).mode & 0o777) === file.mode)
    if (!current) drift.add(path)
  }
  const syncedRoot = join(root, SYNCED_DIR)
  if (existsSync(syncedRoot)) {
    for (const absolute of walk(syncedRoot)) {
      const path = relative(root, absolute).split(sep).join('/')
      if (!files.has(path)) drift.add(path)
    }
  }
  return [...drift].sort()
}

/**
 * Replace `synced/` atomically through a staging directory and write the fixture.
 * @param files - derived files.
 * @param root - bundle package directory.
 */
export function writeSynced(files: SyncedFiles, root: string = PACKAGE_ROOT): void {
  const staging = join(root, `${SYNCED_DIR}.staging`)
  rmSync(staging, { recursive: true, force: true })
  for (const [path, file] of files) {
    const inSynced = path.startsWith(`${SYNCED_DIR}/`)
    const target = inSynced ? join(staging, path.slice(SYNCED_DIR.length + 1)) : join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.data)
    chmodSync(target, file.mode ?? 0o644)
  }
  rmSync(join(root, SYNCED_DIR), { recursive: true, force: true })
  renameSync(staging, join(root, SYNCED_DIR))
}
