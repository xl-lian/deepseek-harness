import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotebookContent } from '../src/client/ResearchLoopView.tsx'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/campaign-types.ts'
import { campaignView, notebookProps } from './campaign-render.client.ts'


const stages = Object.fromEntries(
  STAGES.map((id): [StageId, LoopStage] => [id, { id, status: 'pending', members: [] }]),
) as Record<StageId, LoopStage>
stages.scout = {
  id: 'scout',
  status: 'completed',
  members: [{ id: 'wf:1', label: 'scout', role: 'sa-scout', agent: 'sa-scout', kind: 'workflow', status: 'completed', childId: 'child-1' }],
}
stages.engineer = {
  id: 'engineer',
  status: 'running',
  members: [{ id: 'wf:2', label: 'engineer-h-abc', role: 'sa-engineer', agent: 'sa-engineer', kind: 'workflow', status: 'running', childId: 'child-2' }],
}
stages.verifier = {
  id: 'verifier',
  status: 'failed',
  members: [
    { id: 'wf:3', label: 'verify-h-abc', role: 'sa-verifier', agent: 'sa-verifier', kind: 'workflow', status: 'failed', verdict: 'fail' },
    { id: 'wf:4', label: 'repair-h-abc', role: 'sa-engineer', agent: 'sa-engineer', kind: 'workflow', status: 'running' },
  ],
}

const round: LoopRound = {
  id: 'round-1',
  roundId: 'rd-arch',
  mode: 'full',
  status: 'running',
  startedAt: Date.now() - 9_000,
  anchor: { kind: 'workflow', id: 'run:run-arch' },
  suppressedAnchors: [],
  stages,
}

describe('campaign round section', () => {
  it('renders the experiment as a ring of seven stages with the repair chord', () => {
    const html = renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([round]))} />)
    expect(html).toContain('Campaign round')
    expect(html).toContain('rd-arch')
    expect(html).toContain('Loop of h-abc')
    expect(html.match(/class="rlc-ring-node"/g)).toHaveLength(7)
    for (const label of ['Scout', 'Hypotheses', 'Engineer', 'Verifier', 'Statistician', 'Decide', 'Report']) {
      expect(html).toContain(`>${label}<`)
    }
    expect(html).toContain('class="rlc-ring-repair"')
    expect(html).toContain('>repair<')
    expect(html).toContain('data-flow="flowing"')
    expect(html).toContain('data-status="running"')
    // The running Verifier is selected and lists the hypothesis's attempts.
    expect(html).toContain('Verifier · h-abc')
    expect(html).toContain('verify-h-abc')
    expect(html).toContain('repair-h-abc')
  })

  it('leaves the empty state once a campaign round exists', () => {
    expect(renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([round]))} />)).not.toContain('Nothing recorded yet')
    expect(renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([]))} />)).toContain('Nothing recorded yet')
  })

  it('tags an explore round and the ensemble it built or skipped', () => {
    const explore: LoopRound = { ...round, strategy: 'explore', strategyReason: 'two flat rounds', ensemble: { built: true, members: 3, runs: 2, scores: [0.81, 0.8] } }
    const html = renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([explore]))} />)
    expect(html).toContain('data-tag="explore"')
    expect(html).toContain('title="two flat rounds"')
    expect(html).toContain('>Ensemble of 3<')
    expect(html).toContain('title="0.81, 0.8"')
    const skipped = renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([{ ...round, ensemble: { built: false, reason: 'one candidate' } }]))} />)
    expect(skipped).toContain('>No ensemble<')
    expect(skipped).not.toContain('data-tag="explore"')
  })
})
