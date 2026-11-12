import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ScienceLoopView, type ScienceLoopViewProps } from '../src/client/ScienceLoopView.tsx'
import { en } from '../src/client/locales.ts'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/types.ts'

const t = ((key: string, params?: Record<string, string>) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value)
  return text
}) as TranslateNS<'scienceLoop'>

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

function props(): ScienceLoopViewProps {
  return {
    sessionId: 'session-1',
    useProjection: () => ({ v: 1, rounds: [round], activeRoundId: round.id }),
    openSession: () => {},
    openFile: () => {},
    t,
  } as unknown as ScienceLoopViewProps
}

describe('ScienceLoopView', () => {
  it('renders the architecture flow with agents, statuses and the repair loop', () => {
    const html = renderToStaticMarkup(<ScienceLoopView {...props()} />)
    expect(html).toContain('Science loop')
    expect(html).toContain('rd-arch')
    for (const label of ['Scout', 'Hypotheses', 'Engineer', 'Verifier', 'Statistician', 'Decide', 'Report']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('sa-scout')
    expect(html).toContain('engineer-h-abc')
    expect(html).toContain('verify-h-abc')
    expect(html).toContain('repair-h-abc')
    expect(html).toContain('Repairable failure')
    expect(html).toContain('data-flow="flowing"')
    expect(html).toContain('data-status="running"')
  })

  it('shows the empty state without rounds', () => {
    const emptyProps = {
      sessionId: 'session-1',
      useProjection: () => ({ v: 1, rounds: [], agentPreset: 'standard', scienceSkillLoaded: false }),
      openSession: () => {},
      openFile: () => {},
      t,
    } as unknown as ScienceLoopViewProps
    const html = renderToStaticMarkup(<ScienceLoopView {...emptyProps} />)
    expect(html).toContain('This session is not Science Agent')
    expect(html).toContain('This session uses standard')
  })

  it('explains how to start a Science Agent round', () => {
    const emptyProps = {
      sessionId: 'session-1',
      useProjection: () => ({ v: 1, rounds: [], agentPreset: 'science', scienceSkillLoaded: true }),
      openSession: () => {},
      openFile: () => {},
      t,
    } as unknown as ScienceLoopViewProps
    const html = renderToStaticMarkup(<ScienceLoopView {...emptyProps} />)
    expect(html).toContain('The science skill is loaded')
    expect(html).toContain('/sa-round quick')
    expect(html).toContain('/sa-campaign')
  })
})
