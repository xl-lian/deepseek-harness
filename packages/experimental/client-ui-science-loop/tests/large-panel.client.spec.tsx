import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ScienceLoopLargePanel, ScienceLoopTabTitle, type ScienceLoopLargePanelProps } from '../src/client/ScienceLoopLargePanel.tsx'
import { en } from '../src/client/locales.ts'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/types.ts'

const stages = Object.fromEntries(STAGES.map((id): [StageId, LoopStage] => [id, { id, status: 'pending', members: [] }])) as Record<StageId, LoopStage>
stages.scout = {
  id: 'scout',
  status: 'completed',
  members: [{
    id: 'wf:run-1:1',
    label: 'scout',
    role: 'sa-scout',
    agent: 'sa-scout',
    kind: 'workflow',
    status: 'completed',
    childId: 'child-1',
  }],
}
const round: LoopRound = {
  id: 'round-1',
  roundId: 'rd-1',
  mode: 'full',
  status: 'running',
  startedAt: Date.now() - 20_000,
  anchor: { kind: 'workflow', id: 'run:run-1' },
  suppressedAnchors: [],
  stages,
}

const t = ((key: string, params?: Record<string, string>) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value)
  return text
}) as TranslateNS<'scienceLoop'>

describe('ScienceLoopLargePanel', () => {
  it('renders the round switcher and every stage', () => {
    const props = {
      sessionId: 'session-1',
      useProjection: () => ({ v: 1, rounds: [round], activeRoundId: round.id }),
      openChild: () => {},
      openFile: () => {},
      t,
    } as unknown as ScienceLoopLargePanelProps
    const html = renderToStaticMarkup(<ScienceLoopLargePanel {...props} />)
    expect(html).toContain('Science loop')
    expect(html).toContain('rd-1')
    expect(html).toContain('Rounds')
    for (const label of ['Scout', 'Hypotheses', 'Engineer', 'Verifier', 'Statistician', 'Decide', 'Report']) {
      expect(html).toContain(label)
    }
  })

  it('shows the empty state without rounds', () => {
    const props = {
      sessionId: 'session-1',
      useProjection: () => ({ v: 1, rounds: [], agentPreset: 'standard', scienceSkillLoaded: false }),
      openChild: () => {},
      openFile: () => {},
      t,
    } as unknown as ScienceLoopLargePanelProps
    expect(renderToStaticMarkup(<ScienceLoopLargePanel {...props} />)).toContain('This session is not Science Agent')
  })

  it('renders the localized tab title', () => {
    const props = { t } as unknown as Parameters<typeof ScienceLoopTabTitle>[0]
    expect(renderToStaticMarkup(<ScienceLoopTabTitle {...props} />)).toBe('Science loop')
  })
})
