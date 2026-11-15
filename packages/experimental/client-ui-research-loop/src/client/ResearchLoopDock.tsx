/**
 * Dock above the composer while a research loop runs: the current round, its
 * stage rail, and the elapsed time. Clicking it opens the notebook view.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { activeStage, currentRun, elapsed, formatDuration } from './model.ts'
import type { ResearchView } from '../shared/schema.ts'
import { StageRail, StatusMark, type ResearchTranslate } from './parts.tsx'

/** Actions injected for the dock. */
export interface ResearchLoopDockInjected {
  /** Select the notebook view tab. */
  readonly openNotebook: () => void
}

/** Composed props of the dock. */
export type ResearchLoopDockProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'researchLoop'>
  & ResearchLoopDockInjected

/** Render the live loop strip from a view, or nothing when no loop is running. */
export function DockStrip({ view, openNotebook, t }: ResearchLoopDockInjected & {
  readonly view: ResearchView | undefined
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const run = currentRun(view)
  if (run?.status !== 'running') return null
  const round = run.rounds[run.rounds.length - 1]
  const stage = round === undefined ? undefined : activeStage(round)
  const time = elapsed(run.startedAt, run.endedAt, Date.now())
  return (
    <button type="button" className="rl-dock" onClick={openNotebook}>
      <StatusMark status={run.status} t={t} />
      <span className="rl-dock-title">{t('title')}</span>
      {round === undefined ? null : <span className="rl-dock-round">{t('round.title', { number: round.number })}</span>}
      {round === undefined ? null : <StageRail round={round} t={t} compact />}
      {stage === undefined ? null : <span className="rl-sr">{t(`stage.${stage}`)}</span>}
      {time === undefined ? null : <span className="rl-elapsed">{formatDuration(time)}</span>}
      <span className="rl-dock-open">{t('dock.open')}</span>
    </button>
  )
}

/** Dock slot occupant: reads the projection and renders {@link DockStrip}. */
export function ResearchLoopDock({ useProjection, openNotebook, t }: ResearchLoopDockProps): React.JSX.Element | null {
  return <DockStrip view={useProjection('scienceResearchLoop')} openNotebook={openNotebook} t={t} />
}
