import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type {} from '../src/client/definition.ts'
import { CampaignCardBody } from '../src/client/CampaignCard.tsx'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/campaign-types.ts'
import { campaignView, t } from './campaign-render.client.ts'

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

function card(anchorId: string): string {
  return renderToStaticMarkup(
    <CampaignCardBody
      view={campaignView([round])}
      anchorId={anchorId}
      openFile={() => {}}
      openSessionFor={() => {}}
      openNotebook={() => {}}
      t={t}
    />,
  )
}

describe('CampaignCardBody', () => {
  it('renders the seven stages with live status and round facts', () => {
    const html = card('run:run-1')
    expect(html).toContain('Campaign round')
    expect(html).toContain('rd-1')
    expect(html).toContain('1 running')
    for (const label of ['Scout', 'Hypotheses', 'Engineer', 'Verifier', 'Statistician', 'Decide', 'Report']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('sa-engineer')
    expect(html).toContain('data-status="running"')
  })

  it('renders nothing for a suppressed or unknown anchor', () => {
    expect(card('call:call-1')).toBe('')
    expect(card('run:other')).toBe('')
  })
})
