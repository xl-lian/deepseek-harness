/**
 * Dock above the composer while a research loop, a campaign round, or a
 * paper-writing run is live: the current round or paper stage rail and the
 * elapsed time. It shows one strip: the research run, else the campaign round,
 * else the paper run. Clicking it opens the notebook.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGES } from '../shared/campaign-types.ts'
import { activeStage, currentPaper, currentRun, elapsed, formatDuration, liveCampaignRound } from './model.ts'
import type { ResearchView } from '../shared/schema.ts'
import type { ActivityView } from '../shared/activity-schema.ts'
import { ActivityDockStrip } from './ActivitySection.tsx'
import { PaperDockStrip } from './PaperSection.tsx'
import { Rail, StageRail, StatusMark, type ResearchTranslate } from './parts.tsx'

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

/** Render the live campaign round strip, or nothing when no round needs attention. */
export function CampaignDockStrip({ view, openNotebook, t }: ResearchLoopDockInjected & {
  readonly view: ResearchView | undefined
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const round = liveCampaignRound(view)
  if (round === undefined) return null
  const time = elapsed(round.startedAt, round.endedAt, Date.now())
  const steps = STAGES.map(id => ({ key: id, label: t(`campaign.stage.${id}`), status: round.stages[id].status }))
  return (
    <button type="button" className="rl-dock" onClick={openNotebook}>
      <StatusMark status={round.status} t={t} />
      <span className="rl-dock-title">{t('campaign.title')}</span>
      {round.roundId === undefined ? null : <code className="rl-dock-round">{round.roundId}</code>}
      <Rail steps={steps} t={t} compact />
      {time === undefined ? null : <span className="rl-elapsed">{formatDuration(time)}</span>}
      <span className="rl-dock-open">{t('dock.open')}</span>
    </button>
  )
}

/** Dock slot occupant: reads the projection and renders {@link DockBody}. */
export function ResearchLoopDock({ useProjection, openNotebook, t }: ResearchLoopDockProps): React.JSX.Element | null {
  return <DockBody view={useProjection('scienceResearchLoop')} activity={useProjection('scienceResearchActivity')} openNotebook={openNotebook} t={t} />
}

/** Render one strip: a running research run, else a live campaign round, else a running paper run, else running activity outside loops. */
export function DockBody({ view, activity, openNotebook, t }: ResearchLoopDockInjected & {
  readonly view: ResearchView | undefined
  readonly activity?: ActivityView | undefined
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  if (currentRun(view)?.status === 'running') return <DockStrip view={view} openNotebook={openNotebook} t={t} />
  if (liveCampaignRound(view) !== undefined) return <CampaignDockStrip view={view} openNotebook={openNotebook} t={t} />
  if (currentPaper(view)?.status === 'running') return <PaperDockStrip view={view} openNotebook={openNotebook} t={t} />
  return <ActivityDockStrip view={activity} openNotebook={openNotebook} t={t} />
}
