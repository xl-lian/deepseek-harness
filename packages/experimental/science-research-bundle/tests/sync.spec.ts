/** The sync adapts science-agent's research, paper, and campaign sources by exact anchors; committed output matches its manifest. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ROLE_PRESET_NAMES,
  SyncAnchorError,
  adaptGeneralSkill,
  adaptGuard,
  adaptKaggleSkill,
  adaptRoundTrigger,
  buildPersonas,
  dshWorkflowBody,
  readCampaignTemplates,
  workflowMeta,
} from '../scripts/campaign-sync.ts'
import { NODE_NAMES, adaptPaperSkill, adaptPaperWorkflow, adaptResearchLoop, adaptResearchSkill, readTemplates } from '../scripts/sync.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const templates = readTemplates(root)
const campaignTemplates = readCampaignTemplates(root)
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
    const paper = failure(() => adaptPaperWorkflow(`${meta.replace('research-loop', 'paper-writing')}const x = 1\n`, personas))
    expect(paper.file).toBe('plugin/workflows/paper-writing.js')
    expect(paper.anchor).toContain('loop view field')
    const paperSkill = failure(() => adaptPaperSkill('# Skill\n## Non-negotiables\n', templates))
    expect(paperSkill.file).toBe('plugin/skills/science-paper/SKILL.md')
  })

  it('names the file and anchor when a campaign source no longer matches', () => {
    expect(failure(() => adaptGuard('tool = payload.get("tool")\n')).file).toBe('plugin/hooks/guard.py')
    expect(failure(() => adaptKaggleSkill('# Skill\n', campaignTemplates)).anchor).toContain('The full architecture')
    expect(failure(() => adaptGeneralSkill('# Skill\n', campaignTemplates)).anchor).toContain('## Non-negotiables')
    expect(failure(() => workflowMeta('const x = 1\n', 'w.js')).anchor).toContain('export const meta')
    expect(failure(() => dshWorkflowBody("const s = { type: ['string', 'null'] }\n", 'w.js')).anchor).toContain('type: [')
    expect(failure(() => buildPersonas(new Map([['sa-scout.md', 'body']]), 'note')).anchor).toContain('sa-clerk')
  })

  it('builds personas from front matter names and the runtime note', () => {
    const agents = new Map(['clerk', 'engineer', 'hypothesis', 'reporter', 'scout', 'statistician', 'verifier']
      .map(role => [`sa-${role}.md`, `---\nname: sa-${role}\ntools: Read\n---\n\n${role} body\n`]))
    expect(buildPersonas(agents, 'NOTE\n').get('sa-scout')).toBe('NOTE\n\n\nscout body')
  })

  it('points the round trigger at the dsh workflow tool and keeps both upstream contexts', () => {
    const source = 'CONTEXT = (\n    "call Workflow({name: \\"science-agent:research-loop\\"})"\n)\nNO_WORKSPACE_CONTEXT = (\n    "intake"\n)\n'
    expect(adaptRoundTrigger(source)).toContain('call the dsh `workflow` tool with ({name: \\"research-loop\\"})')
    expect(failure(() => adaptRoundTrigger('CONTEXT = (\n    "x"\n)\n')).anchor).toContain('Workflow({name:')
    expect(failure(() => adaptRoundTrigger('CONTEXT = (\n    "Workflow({name: \\"science-agent:a\\"}) /science-agent:doctor"\n)\n')).anchor).toContain('remains')
    expect(failure(() => adaptRoundTrigger('CONTEXT = (\n    "Workflow({name: \\"science-agent:a\\"})"\n)\n')).anchor).toContain('NO_WORKSPACE_CONTEXT')
  })

  it('keeps committed synced files equal to MANIFEST.json', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'synced/MANIFEST.json'), 'utf8')) as {
      sourceVersion: string
      files: Record<string, string>
    }
    expect(manifest.sourceVersion).toMatch(/^\d+\.\d+\.\d+/u)
    const files = Object.entries(manifest.files)
    expect(files.map(([path]) => path)).toEqual(expect.arrayContaining([
      ...[...NODE_NAMES, ...ROLE_PRESET_NAMES].map(name => `synced/personas/${name}.md`),
      ...['research-loop', 'paper-writing', 'science-campaign', 'science-round', 'kaggle-round'].map(name => `synced/workflows/${name}.js`),
      ...['science-research', 'science-paper', 'science-agent', 'science-agent-kaggle'].map(name => `synced/skills/${name}/SKILL.md`),
    ]))
    for (const [path, digest] of files) {
      expect(createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'), path).toBe(digest)
    }
  })
})
