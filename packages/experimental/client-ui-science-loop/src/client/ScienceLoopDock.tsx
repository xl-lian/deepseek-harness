/**
 * Always-visible dock above the composer: the current round's seven stages at a
 * glance while the run is live. On dsh 0.1.7 a custom transcript node folds into
 * the turn's process disclosure, so the dock is the surface that keeps the loop
 * visible without expanding "Took Xs". Clicking it opens the large Sidebar view.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STAGES, type LoopRound } from '../shared/types.ts'
import { formatDuration, statusLabel } from './parts.tsx'

/** Actions injected for the dock strip. */
export interface ScienceLoopDockInjected {
  readonly openLarge: () => void
}

/** Composed props of the loop dock. */
export type ScienceLoopDockProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'scienceLoop'>
  & ScienceLoopDockInjected

function latestRound(rounds: readonly LoopRound[], activeRoundId: string | undefined): LoopRound | undefined {
  return rounds.find(round => round.id === activeRoundId) ?? rounds[rounds.length - 1]
}

/** Render the live loop strip, or nothing when no round needs attention. */
export function ScienceLoopDock(props: ScienceLoopDockProps): React.JSX.Element | null {
  const { useProjection, openLarge, t } = props
  const view = useProjection('scienceAgentLoop')
  const round = view === undefined ? undefined : latestRound(view.rounds, view.activeRoundId)
  if (round === undefined) return null
  if (round.status === 'completed' || round.status === 'cancelled' || round.status === 'interrupted') return null

  const now = Date.now()
  return (
    <button type="button" className="sal-dock" data-status={round.status} onClick={openLarge}>
      <span className="sal-dot" data-status={round.status} aria-hidden="true" />
      <span className="sal-dock-title">{t('title')}</span>
      {round.roundId === undefined ? null : <code className="sal-round-id">{round.roundId}</code>}
      <span className="sal-status">{statusLabel(t, round.status)}</span>
      <span className="sal-dock-stages">
        {STAGES.map((id) => {
          const stage = round.stages[id]
          return (
            <span key={id} className="sal-dock-stage" data-status={stage.status}>
              <span className="sal-dot" data-status={stage.status} aria-hidden="true" />
              {t(`stage.${id}`)}
            </span>
          )
        })}
      </span>
      <span className="sal-elapsed">
        {t('header.elapsed', { time: formatDuration((round.endedAt ?? now) - (round.startedAt ?? now)) })}
      </span>
      <span className="sal-dock-open">{t('header.expand')}</span>
    </button>
  )
}
