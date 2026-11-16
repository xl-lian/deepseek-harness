import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CampaignDockStrip, DockBody } from '../src/client/ResearchLoopDock.tsx'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/campaign-types.ts'
import type { ResearchView } from '../src/shared/schema.ts'
import { campaignView, t } from './campaign-render.client.ts'


function round(status: LoopRound['status']): LoopRound {
  const stages = Object.fromEntries(
    STAGES.map((id): [StageId, LoopStage] => [id, { id, status: 'pending', members: [] }]),
  ) as Record<StageId, LoopStage>
  stages.scout = { id: 'scout', status: 'completed', members: [] }
  stages.engineer = { id: 'engineer', status: 'running', members: [] }
  return {
    id: 'round-1',
    roundId: 'rd-9',
    mode: 'full',
    status,
    startedAt: Date.now() - 5_000,
    anchor: { kind: 'workflow', id: 'run:run-9' },
    suppressedAnchors: [],
    stages,
  }
}

function strip(status: LoopRound['status']): string {
  return renderToStaticMarkup(<CampaignDockStrip view={campaignView([round(status)])} openNotebook={() => {}} t={t} />)
}

function dock(view: ResearchView): string {
  return renderToStaticMarkup(<DockBody view={view} openNotebook={() => {}} t={t} />)
}

describe('campaign dock strip', () => {
  it('shows the live stages while a round is running', () => {
    const html = strip('running')
    expect(html).toContain('Campaign round')
    expect(html).toContain('rd-9')
    expect(html).toContain('Scout')
    expect(html).toContain('Report')
  })

  it('hides itself after the round completes', () => {
    expect(strip('completed')).toBe('')
    expect(strip('interrupted')).toBe('')
  })

  it('stays one strip: the dock shows the campaign round only when no research run is running', () => {
    expect(dock(campaignView([round('running')]))).toContain('Campaign round')
    expect(dock(campaignView([round('completed')]))).toBe('')
  })
})
