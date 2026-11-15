/** The research sync adapts science-agent sources by exact anchors and its committed output matches its manifest. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SyncAnchorError } from '@deepseek-ai/dsh-experimental-science-agent-bundle/scripts/sync.ts'
import { NODE_NAMES, adaptResearchLoop, adaptResearchSkill, readTemplates } from '../scripts/sync.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const templates = readTemplates(root)
const personas = new Map(NODE_NAMES.map(name => [name, `${name} persona`]))

function failure(run: () => unknown): SyncAnchorError {
  try {
    run()
  } catch (error) {
    if (error instanceof SyncAnchorError) return error
    throw error
  }
  throw new Error('expected a SyncAnchorError')
}

describe('science-agent research sync', () => {
  it('names the file and the missing anchor when a source changed', () => {
    const meta = "export const meta = {\n  name: 'research-loop',\n  phases: [\n    { title: 'Open', detail: 'x' },\n  ],\n}\n\n"
    const loop = failure(() => adaptResearchLoop(`${meta}const x = 1\n`, personas, templates.recordOutputs))
    expect(loop.file).toBe('plugin/workflows/research-loop.js')
    expect(loop.anchor).toContain('loop view field')
    const skill = failure(() => adaptResearchSkill('# Skill\n## Non-negotiables\n', templates))
    expect(skill.file).toBe('plugin/skills/science-research/SKILL.md')
    expect(skill.anchor).toContain('launch fallback')
  })

  it('keeps committed synced files equal to MANIFEST.json', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'synced/MANIFEST.json'), 'utf8')) as {
      sourceVersion: string
      files: Record<string, string>
    }
    expect(manifest.sourceVersion).toMatch(/^\d+\.\d+\.\d+/u)
    const files = Object.entries(manifest.files)
    expect(files.map(([path]) => path)).toEqual(expect.arrayContaining(NODE_NAMES.map(name => `synced/personas/${name}.md`)))
    for (const [path, digest] of files) {
      expect(createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'), path).toBe(digest)
    }
  })
})
