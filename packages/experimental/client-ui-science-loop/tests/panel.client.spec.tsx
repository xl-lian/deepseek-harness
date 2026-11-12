import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type {} from '../src/client/definition.ts'
import { ScienceLoopPanel, type ScienceLoopPanelProps } from '../src/client/ScienceLoopPanel.tsx'
import { en } from '../src/client/locales.ts'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/types.ts'

function stage(id: StageId, status: LoopStage['status'], members: LoopStage['members'] = []): LoopStage {
  return { id, status, members }
}

const stages = Object.fromEntries(STAGES.map(id => [id, stage(id, 'pending')])) as Record<StageId, LoopStage>
stages.scout = stage('scout', 'completed', [{
  id: 'wf:run-1:1',
  label: 'scout',
  role: 'sa-scout',
  agent: 'sa-scout',
  kind: 'workflow',
  status: 'completed',
  startedAt: Date.now() - 60_000,
  endedAt: Date.now() - 50_000,
  childId: 'child-1',
}])
stages.engineer = stage('engineer', 'running', [{
  id: 'wf:run-1:2',
  label: 'engineer-h-abc',
  role: 'sa-engineer',
  agent: 'sa-engineer',
  kind: 'workflow',
  status: 'running',
  startedAt: Date.now() - 20_000,
  childId: 'child-2',
  metrics: { roc_auc: 0.83 },
}])

const round: LoopRound = {
  id: 'round-1',
  roundId: 'rd-1',
  mode: 'full',
  status: 'running',
  startedAt: Date.now() - 65_000,
  anchor: { kind: 'workflow', id: 'run:run-1' },
  suppressedAnchors: ['call:call-1'],
  stages,
  scout: {
    summary: 'tabular binary classification',
    metric: 'roc_auc',
    risks: ['leakage in id column'],
    evidence: [],
  },
}

function makeProps(anchorId: string): ScienceLoopPanelProps {
  const t = ((key: keyof typeof en, params?: Record<string, string>) => {
    let text = en[key] ?? key
    for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value)
    return text
  }) as ScienceLoopPanelProps['t']
  return {
    node: { data: { anchorId } },
    sessionId: 'session-1',
    useProjection: () => ({ v: 1, rounds: [round] }),
    openFile: () => {},
    openSession: () => {},
    openLarge: () => {},
    t,
  } as unknown as ScienceLoopPanelProps
}

describe('ScienceLoopPanel', () => {
  it('renders the seven stages with live status and round facts', () => {
    const html = renderToStaticMarkup(<ScienceLoopPanel {...makeProps('run:run-1')} />)
    expect(html).toContain('Science loop')
    expect(html).toContain('rd-1')
    expect(html).toContain('1 running')
    for (const label of ['Scout', 'Hypotheses', 'Engineer', 'Verifier', 'Statistician', 'Decide', 'Report']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('sa-engineer')
    expect(html).toContain('data-status="running"')
  })

  it('renders nothing for a suppressed or unknown anchor', () => {
    expect(renderToStaticMarkup(<ScienceLoopPanel {...makeProps('call:call-1')} />)).toBe('')
    expect(renderToStaticMarkup(<ScienceLoopPanel {...makeProps('run:other')} />)).toBe('')
  })
})
