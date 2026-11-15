/**
 * Pure parsers for what the `paper-writing` workflow writes to the parent
 * Session log: `agent()` member labels and its fixed-grammar `log()` lines. A
 * line or label outside the grammar parses to `undefined`; nothing is guessed.
 */

import type { PaperMember } from './schema.ts'

/** What one paper member label says. */
export type ParsedPaperLabel = Pick<PaperMember, 'kind' | 'target' | 'pass'>

const LABEL_RULES: readonly (readonly [RegExp, (match: RegExpExecArray) => ParsedPaperLabel])[] = [
  [/^(setup|outline|references|review)$/u, match => ({ kind: match[1] as 'setup' | 'outline' | 'references' | 'review' })],
  [/^item-(.+)$/u, match => ({ kind: 'item', target: match[1] })],
  [/^section-(.+)$/u, match => ({ kind: 'section', target: match[1] })],
  [/^(check|audit|compile|fix)-(\d+)$/u, match => ({ kind: match[1] as 'check' | 'audit' | 'compile' | 'fix', pass: Number(match[2]) })],
  [/^revise-(.+)-(\d+)$/u, match => ({ kind: 'revise', target: match[1], pass: Number(match[2]) })],
]

/**
 * Parse a `paper-writing` member label.
 * @param label - the `agent()` label, such as `paper-section-results` or `paper-audit-2`.
 * @returns the kind, target, and pass, or `undefined` for a label outside the grammar.
 */
export function parsePaperLabel(label: string): ParsedPaperLabel | undefined {
  const scoped = /^paper-(.+)$/u.exec(label)
  if (scoped === null) return undefined
  for (const [pattern, build] of LABEL_RULES) {
    const match = pattern.exec(scoped[1] ?? '')
    if (match !== null) return build(match)
  }
  return undefined
}

/** What one paper narration line says. */
export type ParsedPaperLine =
  | { readonly kind: 'title'; readonly title: string }
  | { readonly kind: 'references'; readonly entries: number; readonly missing: readonly string[] }
  | { readonly kind: 'item'; readonly id: string; readonly item: 'figure' | 'table'; readonly status: 'ready' | 'blocked' | 'failed'; readonly reason: string }
  | { readonly kind: 'section'; readonly id: string; readonly written: boolean; readonly words?: number | undefined }
  | { readonly kind: 'audit'; readonly pass: number; readonly blocking: number; readonly minor: number; readonly numbers?: number | undefined; readonly citations?: number | undefined }
  | { readonly kind: 'review'; readonly recommendation: string; readonly summary?: string | undefined }
  | { readonly kind: 'revise'; readonly pass: number }
  | { readonly kind: 'compile'; readonly status: 'ok' | 'failed' | 'skipped'; readonly pages?: number | undefined; readonly pdf?: string | undefined; readonly detail?: string | undefined }
  | { readonly kind: 'stopped'; readonly reason: string; readonly detail?: string | undefined }

function count(text: string | undefined): number | undefined {
  return text === undefined || !/^\d+$/u.test(text) ? undefined : Number(text)
}

/**
 * Parse one `paper-writing` narration line.
 * @param line - the `log()` message.
 * @returns the parsed fact, or `undefined` for a line outside the grammar.
 */
export function parsePaperLine(line: string): ParsedPaperLine | undefined {
  let match = /^Paper references: (\d+) entr(?:y|ies)(?: · not citable: (.*))?$/u.exec(line)
  if (match !== null) return { kind: 'references', entries: Number(match[1]), missing: (match[2] ?? '').split(', ').filter(Boolean) }
  match = /^Paper item (\S+): (figure|table) (ready|blocked|failed) — (.*)$/u.exec(line)
  if (match !== null) {
    return {
      kind: 'item', id: match[1] ?? '', item: match[2] === 'table' ? 'table' : 'figure',
      status: match[3] === 'ready' ? 'ready' : match[3] === 'blocked' ? 'blocked' : 'failed', reason: match[4] ?? '',
    }
  }
  match = /^Paper section (\S+): (?:(\d+) words|(written)|failed — .*)$/u.exec(line)
  if (match !== null) return { kind: 'section', id: match[1] ?? '', written: match[2] !== undefined || match[3] !== undefined, words: count(match[2]) }
  match = /^Paper audit pass (\d+): (\d+) blocking, (\d+) minor(?: · numbers (\S+), citations (\S+))?/u.exec(line)
  if (match !== null) {
    return { kind: 'audit', pass: Number(match[1]), blocking: Number(match[2]), minor: Number(match[3]), numbers: count(match[4]), citations: count(match[5]) }
  }
  match = /^Paper review: (accept|minor-revision|major-revision)(?: — (.*))?$/u.exec(line)
  if (match !== null) return { kind: 'review', recommendation: match[1] ?? '', summary: match[2] }
  match = /^Paper revise pass (\d+): /u.exec(line)
  if (match !== null) return { kind: 'revise', pass: Number(match[1]) }
  match = /^Paper compile: ok · (\S+) page\(s\) · (\S+)/u.exec(line)
  if (match !== null) return { kind: 'compile', status: 'ok', pages: count(match[1]), pdf: match[2] }
  match = /^Paper compile: (skipped|failed) — (.*)$/u.exec(line)
  if (match !== null) return { kind: 'compile', status: match[1] === 'skipped' ? 'skipped' : 'failed', detail: match[2] }
  match = /^Paper stopped: (\S+)(?: — (.*))?$/u.exec(line)
  if (match !== null) return { kind: 'stopped', reason: match[1] ?? '', detail: match[2] }
  // After every `Paper <keyword>:` rule, so a title that starts with such a keyword is not taken for one.
  match = /^Paper: (.+)$/u.exec(line)
  return match === null ? undefined : { kind: 'title', title: match[1] ?? '' }
}

/** Workspace-relative paper files, as the paper kit lays them out. */
export const PAPER_PATHS = {
  main: 'paper/main.tex',
  outline: 'paper/outline.md',
  bibliography: 'paper/references.bib',
  audit: 'paper/audit.md',
  review: 'paper/review.md',
  pdf: 'paper/build/main.pdf',
} as const

/**
 * Workspace-relative file of a paper section.
 * @param id - section id.
 * @returns the section's LaTeX file.
 */
export function paperSectionPath(id: string): string {
  return `paper/sections/${id}.tex`
}

/**
 * Workspace-relative file of a figure or table.
 * @param kind - `figure` or `table`.
 * @param id - item id.
 * @returns the item's LaTeX file.
 */
export function paperItemPath(kind: 'figure' | 'table', id: string): string {
  return `paper/${kind === 'table' ? 'tables' : 'figures'}/${id}.tex`
}
