import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActivityDockStrip, ActivitySection } from '../src/client/ActivitySection.tsx'
import { DockBody } from '../src/client/ResearchLoopDock.tsx'
import { NotebookContent } from '../src/client/ResearchLoopView.tsx'
import type { ActivityTurn, ActivityView } from '../src/shared/activity-schema.ts'
import type { LoopRound, LoopStage, StageId } from '../src/shared/campaign-types.ts'
import { STAGES } from '../src/shared/campaign-types.ts'
import { campaignView, notebookProps, t } from './campaign-render.client.ts'

function turn(number: number, status: ActivityTurn['status']): ActivityTurn {
  return {
    turn: number,
    headline: `prompt ${number}`,
    status,
    startedAt: 1_000,
    steps: [
      { callId: `c${number}`, kind: 'command', label: 'Inspect working directory', command: 'ls -la', status: 'completed', startedAt: 1_000, endedAt: 2_000, background: false },
      { callId: `b${number}`, kind: 'command', label: 'Train model', command: 'python train.py', status: 'running', startedAt: 1_000, background: true, jobId: 'j1' },
      { callId: `e${number}`, kind: 'edit', label: 'tools/probe.py', status: 'failed', startedAt: 1_000, endedAt: 1_500, background: false, detail: 'no match' },
    ],
    dropped: number === 1 ? 2 : 0,
    files: ['tools/probe.py'],
  }
}

const activity = (...turns: ActivityTurn[]): ActivityView => ({ v: 1, turns })

function round(status: LoopRound['status']): LoopRound {
  const stages = Object.fromEntries(STAGES.map((id): [StageId, LoopStage] => [id, { id, status: 'pending', members: [] }])) as Record<StageId, LoopStage>
  return { id: 'round-1', roundId: 'rd-1', status, startedAt: 1, anchor: { kind: 'workflow', id: 'run:r' }, suppressedAnchors: [], stages }
}

const noop = (): void => {}

describe('activity in the notebook', () => {
  it('replaces the empty state with the activity when no loop has run', () => {
    const html = renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([]))} activity={activity(turn(1, 'completed'))} />)
    expect(html).not.toContain('Nothing recorded yet')
    expect(html).toContain('Activity outside loops')
    expect(html).toContain('prompt 1')
    expect(html).toContain('Inspect working directory')
    expect(html).toContain('ls -la')
    expect(html).toContain('Background')
    expect(html).toContain('no match')
    expect(html).toContain('2 more steps not shown')
    expect(html).toContain('Files changed')
    expect(html).not.toContain('<details')
  })

  it('collapses beneath loop rounds and opens while its latest turn runs', () => {
    const settled = renderToStaticMarkup(<NotebookContent {...notebookProps(campaignView([round('completed')]))} activity={activity(turn(1, 'completed'))} />)
    expect(settled).toContain('<details class="rl-activity-details">')
    expect(settled.indexOf('Campaign round')).toBeLessThan(settled.indexOf('Activity outside loops'))
    const live = renderToStaticMarkup(<ActivitySection view={activity(turn(1, 'running'))} secondary openPath={noop} t={t} />)
    expect(live).toContain('<details class="rl-activity-details" open="">')
  })

  it('shows the newest turns first, up to the limit, and nothing without activity', () => {
    const html = renderToStaticMarkup(<ActivitySection view={activity(turn(1, 'completed'), turn(2, 'completed'), turn(3, 'completed'))} secondary={false} limit={2} openPath={noop} t={t} />)
    expect(html.indexOf('prompt 3')).toBeLessThan(html.indexOf('prompt 2'))
    expect(html).not.toContain('prompt 1')
    expect(renderToStaticMarkup(<ActivitySection view={undefined} secondary={false} openPath={noop} t={t} />)).toBe('')
    const untitled = renderToStaticMarkup(<ActivitySection view={activity({ ...turn(4, 'completed'), headline: undefined })} secondary={false} openPath={noop} t={t} />)
    expect(untitled).toContain('Turn without a prompt')
  })

  it('docks the running activity only when no loop is live', () => {
    expect(renderToStaticMarkup(<ActivityDockStrip view={activity(turn(1, 'running'))} openNotebook={noop} t={t} />)).toContain('Working outside a loop')
    expect(renderToStaticMarkup(<ActivityDockStrip view={activity(turn(1, 'completed'))} openNotebook={noop} t={t} />)).toBe('')
    expect(renderToStaticMarkup(<ActivityDockStrip view={activity({ ...turn(1, 'running'), steps: [] })} openNotebook={noop} t={t} />)).toContain('Working outside a loop')
    const loopLive = renderToStaticMarkup(<DockBody view={campaignView([round('running')])} activity={activity(turn(1, 'running'))} openNotebook={noop} t={t} />)
    expect(loopLive).toContain('Campaign round')
    expect(loopLive).not.toContain('Working outside a loop')
    expect(renderToStaticMarkup(<DockBody view={campaignView([])} activity={activity(turn(1, 'running'))} openNotebook={noop} t={t} />)).toContain('Working outside a loop')
  })
})
