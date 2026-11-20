/**
 * Pure parsers for what the `research-loop` workflow writes to the parent
 * Session log: `agent()` member labels and the fixed-grammar `log()` lines the
 * science-research bundle's narration helpers emit. A line or label outside the
 * grammar parses to `undefined`; nothing is guessed.
 */

import { STAGE_OF, isVerdict, type ResearchStageId } from './constants.ts'
import type { MemberKind, ResearchMember, ResearchVerdict } from './schema.ts'

/** What one member label says about its round and experiment. */
export interface ParsedLabel {
  /** Round number for `r<N>-…` labels; absent for `close-<i>`. */
  readonly round?: number | undefined
  readonly kind: MemberKind
  readonly experimentId?: string | undefined
  readonly focusId?: string | undefined
  readonly pass?: number | undefined
}

const LABEL_RULES: readonly (readonly [RegExp, (match: RegExpExecArray) => Omit<ParsedLabel, 'round'>])[] = [
  [/^retrieve-search$/u, () => ({ kind: 'search' })],
  [/^read-(.+)$/u, match => ({ kind: 'read', focusId: match[1] })],
  [/^retrieve-refine-(\d+)$/u, match => ({ kind: 'refine', pass: Number(match[1]) })],
  // `plan-<n>` is the n-th plan of the round: a revision after blocked builds, before any run.
  [/^plan(?:-(\d+))?$/u, match => ({ kind: 'plan', pass: match[1] === undefined ? undefined : Number(match[1]) })],
  // `build-<id>-rev<n>` rebuilds an experiment after plan revision n.
  [/^build-(.+?)(?:-rev(\d+))?$/u, match => ({ kind: 'build', experimentId: match[1], pass: match[2] === undefined ? undefined : Number(match[2]) + 1 })],
  [/^run-(.+)-(\d+)$/u, match => ({ kind: 'run', experimentId: match[1], pass: Number(match[2]) })],
  [/^debug-(.+)-(\d+)$/u, match => ({ kind: 'debug', experimentId: match[1], pass: Number(match[2]) })],
  [/^check-(.+)$/u, match => ({ kind: 'check', experimentId: match[1] })],
  [/^challenge-(.+)-(\d+)$/u, match => ({ kind: 'challenge', experimentId: match[1], pass: Number(match[2]) })],
  [/^recheck-(.+)-(\d+)$/u, match => ({ kind: 'recheck', experimentId: match[1], pass: Number(match[2]) })],
  [/^next-step$/u, () => ({ kind: 'next' })],
  // A plan save may be a revision's (`save-plan-2`) or the id-only registration fallback (`-ids`).
  [/^save-(plan(?:-\d+)?|next)(?:-ids)?(?:-retry)?$/u, () => ({ kind: 'save' })],
  [/^save-(.+?)(?:-retry)?$/u, match => ({ kind: 'save', experimentId: match[1] })],
]

/**
 * Parse a `research-loop` member label.
 * @param label - the `agent()` label, such as `r2-check-e1` or `close-1`.
 * @returns the round, kind, and ids, or `undefined` for labels the view does not show (`open-<i>`, `write-up`).
 */
export function parseLabel(label: string): ParsedLabel | undefined {
  // `close-<i>-plain` closes without the next-step result after the combined close failed.
  if (/^close-\d+(?:-plain)?(?:-retry)?$/u.test(label)) return { kind: 'close' }
  const scoped = /^r(\d+)-(.+)$/u.exec(label)
  if (scoped === null) return undefined
  for (const [pattern, build] of LABEL_RULES) {
    const match = pattern.exec(scoped[2] ?? '')
    if (match !== null) return { round: Number(scoped[1]), ...build(match) }
  }
  return undefined
}

/**
 * Stage a member belongs to; a save belongs to the stage whose results it records.
 * @param member - member with kind, label, and experiment id.
 * @returns the round stage.
 */
export function memberStage(member: Pick<ResearchMember, 'kind' | 'label' | 'experimentId'>): ResearchStageId {
  if (member.kind !== 'save') return STAGE_OF[member.kind]
  if (member.experimentId !== undefined) return 'validate'
  return member.label.includes('-save-plan') ? 'plan' : 'next'
}

/** One planned experiment named on a `plan: registered` line. */
export interface PlannedExperiment {
  readonly id: string
  readonly title: string
  readonly role: 'confirmatory' | 'exploratory'
}

/** What one narration line says. */
export type ParsedLine =
  | { readonly kind: 'open'; readonly round: number; readonly roundId: string; readonly reused: boolean }
  | { readonly kind: 'reading'; readonly round: number; readonly focuses: number; readonly passes: number; readonly enough: boolean }
  | { readonly kind: 'plan'; readonly round: number; readonly experiments: readonly PlannedExperiment[] }
  | { readonly kind: 'plan-error'; readonly round: number; readonly error: string }
  | { readonly kind: 'verdict'; readonly round: number; readonly id: string; readonly verdict: ResearchVerdict; readonly confidence: string; readonly unresolved: readonly string[]; readonly runIds: readonly string[] }
  | { readonly kind: 'outcome'; readonly round: number; readonly id: string; readonly outcome: string; readonly reason: string; readonly runIds: readonly string[] }
  | { readonly kind: 'next'; readonly round: number; readonly decision: 'continue' | 'stop'; readonly reason: string }
  | { readonly kind: 'human'; readonly round: number; readonly text: string }
  | { readonly kind: 'round-note'; readonly round: number; readonly text: string }
  | { readonly kind: 'stopped'; readonly reason: string; readonly detail?: string | undefined }
  | { readonly kind: 'write-up'; readonly answer: string }

const QUOTED_TITLE = /^(\S+) ("(?:[^"\\]|\\.)*") \[(confirmatory|exploratory)\]$/u

function plannedExperiments(listing: string): PlannedExperiment[] | undefined {
  if (listing === 'no experiments') return []
  const out: PlannedExperiment[] = []
  for (const item of listing.split(' · ')) {
    const match = QUOTED_TITLE.exec(item)
    if (match === null) return undefined
    let title: unknown
    try {
      title = JSON.parse(match[2] ?? '')
    } catch {
      // The title is quoted by JSON.stringify in the workflow; a line that does not parse is outside the grammar.
      return undefined
    }
    out.push({ id: match[1] ?? '', title: String(title), role: match[3] === 'confirmatory' ? 'confirmatory' : 'exploratory' })
  }
  return out
}

/** Split `<head> · open objections: a, b · runs x, y` into its parts. */
function splitTail(text: string): { readonly head: string; readonly unresolved: string[]; readonly runIds: string[] } {
  const parts = text.split(' · ')
  let head = parts.shift() ?? ''
  const unresolved: string[] = []
  const runIds: string[] = []
  for (const part of parts) {
    if (part.startsWith('open objections: ')) unresolved.push(...part.slice('open objections: '.length).split(', ').filter(Boolean))
    else if (part.startsWith('runs ')) runIds.push(...part.slice('runs '.length).split(', ').filter(Boolean))
    else head = `${head} · ${part}`
  }
  return { head, unresolved, runIds }
}

const VERDICT_LINE = /^Round (\d+) (\S+): (\w+) \((\w+)\)(.*)$/u

/**
 * Parse one `research-loop` narration line.
 * @param line - the `log()` message.
 * @returns the parsed fact, or `undefined` for a line outside the grammar.
 */
export function parseLogLine(line: string): ParsedLine | undefined {
  let match = /^Round (\d+) \(([^)]+)\)(.*)$/u.exec(line)
  if (match !== null) return { kind: 'open', round: Number(match[1]), roundId: match[2] ?? '', reused: (match[3] ?? '').includes('resuming') }
  match = /^Round (\d+) reading: (\d+) focus note\(s\), (\d+) pass\(es\), (enough|not enough)$/u.exec(line)
  if (match !== null) {
    return { kind: 'reading', round: Number(match[1]), focuses: Number(match[2]), passes: Number(match[3]), enough: match[4] === 'enough' }
  }
  match = /^Round (\d+) plan: registered · (.*)$/u.exec(line)
  if (match !== null) {
    const experiments = plannedExperiments(match[2] ?? '')
    return experiments === undefined ? undefined : { kind: 'plan', round: Number(match[1]), experiments }
  }
  match = /^Round (\d+) plan: not registered — (.*)$/u.exec(line)
  if (match !== null) return { kind: 'plan-error', round: Number(match[1]), error: match[2] ?? '' }
  match = /^Round (\d+) next step: (continue|stop) — (.*)$/u.exec(line)
  if (match !== null) return { kind: 'next', round: Number(match[1]), decision: match[2] === 'continue' ? 'continue' : 'stop', reason: match[3] ?? '' }
  match = /^Round (\d+) needs a human: (.*)$/u.exec(line)
  if (match !== null) return { kind: 'human', round: Number(match[1]), text: match[2] ?? '' }
  match = VERDICT_LINE.exec(line)
  const verdict = match?.[3]
  if (match !== null && isVerdict(verdict)) {
    const tail = splitTail(match[5] ?? '')
    return {
      kind: 'verdict', round: Number(match[1]), id: match[2] ?? '', verdict, confidence: match[4] ?? '',
      unresolved: tail.unresolved, runIds: tail.runIds,
    }
  }
  match = /^Round (\d+) (\S+): (ran|failed|blocked) — (.*)$/u.exec(line)
  if (match !== null) {
    const tail = splitTail(match[4] ?? '')
    return { kind: 'outcome', round: Number(match[1]), id: match[2] ?? '', outcome: match[3] ?? '', reason: tail.head, runIds: tail.runIds }
  }
  match = /^Round (\d+)[:,] (.*)$/u.exec(line)
  if (match !== null) return { kind: 'round-note', round: Number(match[1]), text: match[2] ?? '' }
  match = /^Loop stopped: (\S+)(?: — (.*))?$/u.exec(line)
  if (match !== null) return { kind: 'stopped', reason: match[1] ?? '', detail: match[2] }
  match = /^Write-up: (.*)$/u.exec(line)
  if (match !== null) return { kind: 'write-up', answer: match[1] ?? '' }
  return undefined
}

/**
 * Workspace-relative notebook paths, as `sagent research` lays them out.
 * @param round - round number, or `undefined` for the study-level files only.
 * @returns path by notebook key.
 */
export function notebookPaths(round?: number): {
  readonly question: string
  readonly guidance: string
  readonly state: string
  readonly nextPlan: string
  readonly report: string
  readonly roundPlan?: string | undefined
  readonly coverage?: string | undefined
  readonly retrievalDir?: string | undefined
  readonly validationDir?: string | undefined
} {
  const base = round === undefined ? undefined : `research/rounds/${String(round).padStart(2, '0')}`
  return {
    question: 'research/question.md',
    guidance: 'research/guidance.md',
    state: 'research/state.md',
    nextPlan: 'research/plan.md',
    report: 'research/report.md',
    ...(base === undefined
      ? {}
      : {
        roundPlan: `${base}/plan.md`,
        coverage: `${base}/retrieval/coverage.md`,
        retrievalDir: `${base}/retrieval`,
        validationDir: `${base}/validation`,
      }),
  }
}
