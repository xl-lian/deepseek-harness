/** The sync tool adapts science-agent sources by exact anchors and its committed output matches its manifest. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SyncAnchorError,
  adaptGeneralSkill,
  adaptGuard,
  adaptKaggleSkill,
  adaptRoundTrigger,
  buildPersonas,
  dshWorkflowBody,
  readTemplates,
  workflowMeta,
} from '../scripts/sync.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const templates = readTemplates(root)

function anchorError(run: () => unknown): SyncAnchorError {
  try {
    run()
  } catch (error) {
    if (error instanceof SyncAnchorError) return error
    throw error
  }
  throw new Error('expected a SyncAnchorError')
}

describe('science-agent sync', () => {
  it('names the file and anchor when a source no longer matches', () => {
    expect(anchorError(() => adaptGuard('tool = payload.get("tool")\n')).file).toBe('plugin/hooks/guard.py')
    expect(anchorError(() => adaptKaggleSkill('# Skill\n', templates)).anchor).toContain('The full architecture')
    expect(anchorError(() => adaptGeneralSkill('# Skill\n', templates)).anchor).toContain('## Non-negotiables')
    expect(anchorError(() => adaptRoundTrigger('CONTEXT = "x"\n', 'y')).anchor).toContain('CONTEXT')
    expect(anchorError(() => workflowMeta('const x = 1\n', 'w.js')).anchor).toContain('export const meta')
    expect(anchorError(() => dshWorkflowBody("const s = { type: ['string', 'null'] }\n", 'w.js')).anchor).toContain('type: [')
    expect(anchorError(() => buildPersonas(new Map([['sa-scout.md', 'body']]), 'note')).anchor).toContain('sa-clerk')
  })

  it('builds personas from front matter names and the runtime note', () => {
    const agents = new Map(['clerk', 'engineer', 'hypothesis', 'reporter', 'scout', 'statistician', 'verifier']
      .map(role => [`sa-${role}.md`, `---\nname: sa-${role}\ntools: Read\n---\n\n${role} body\n`]))
    const personas = buildPersonas(agents, 'NOTE\n')
    expect(personas.get('sa-scout')).toBe('NOTE\n\n\nscout body')
  })

  it('rewrites the round trigger context as one Python string literal', () => {
    const source = 'X = 1\nCONTEXT = (\n    "a "\n    "b"\n)\n\nY = 2\n'
    expect(adaptRoundTrigger(source, 'say "go"')).toBe('X = 1\nCONTEXT = "say \\"go\\""\n\nY = 2\n')
  })

  it('keeps committed synced files equal to MANIFEST.json', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'synced/MANIFEST.json'), 'utf8')) as { files: Record<string, string> }
    const entries = Object.entries(manifest.files)
    expect(entries.length).toBeGreaterThan(20)
    for (const [path, digest] of entries) {
      expect(createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'), path).toBe(digest)
    }
  })
})
