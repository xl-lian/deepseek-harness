import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ScienceLoopDock, type ScienceLoopDockProps } from '../src/client/ScienceLoopDock.tsx'
import { en } from '../src/client/locales.ts'
import { STAGES, type LoopRound, type LoopStage, type StageId } from '../src/shared/types.ts'

const t = ((key: string, params?: Record<string, string>) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value)
  return text
}) as TranslateNS<'scienceLoop'>

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

function props(status: LoopRound['status']): ScienceLoopDockProps {
  return {
    useProjection: () => ({ v: 1, rounds: [round(status)], activeRoundId: 'round-1' }),
    openLarge: () => {},
    t,
  } as unknown as ScienceLoopDockProps
}

describe('ScienceLoopDock', () => {
  it('shows the live stages while a round is running', () => {
    const html = renderToStaticMarkup(<ScienceLoopDock {...props('running')} />)
    expect(html).toContain('Science loop')
    expect(html).toContain('rd-9')
    expect(html).toContain('Scout')
    expect(html).toContain('Report')
    expect(html).toContain('elapsed')
  })

  it('hides itself after the round completes', () => {
    expect(renderToStaticMarkup(<ScienceLoopDock {...props('completed')} />)).toBe('')
  })
})
