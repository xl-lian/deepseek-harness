/**
 * Activity in the notebook: the commands and file changes the agent made
 * outside a recorded loop, one entry per turn, newest first, and the dock strip
 * shown while such a turn runs and no loop is live.
 */

import type { ActivityStep, ActivityTurn, ActivityView } from '../shared/activity-schema.ts'
import { elapsed, formatDuration } from './model.ts'
import { FileLink, StatusMark, type OpenPath, type ResearchTranslate } from './parts.tsx'

/** Turns shown in the right-Sidebar pane, where space is short. */
export const PANE_TURNS = 3

function StepRow({ step, t }: { readonly step: ActivityStep; readonly t: ResearchTranslate }): React.JSX.Element {
  const time = elapsed(step.startedAt, step.endedAt, Date.now())
  return (
    <li className="rl-activity-step" data-status={step.status}>
      <StatusMark status={step.status} t={t} />
      <span className="rl-activity-label">{step.label}</span>
      {step.background ? <span className="rl-tag">{t('activity.background')}</span> : null}
      {step.command === undefined || step.command === step.label ? null : <code className="rl-activity-command">{step.command}</code>}
      {step.detail === undefined ? null : <span className="rl-muted">{step.detail}</span>}
      {time === undefined ? null : <span className="rl-elapsed">{formatDuration(time)}</span>}
    </li>
  )
}

function TurnEntry({ turn, openPath, t }: {
  readonly turn: ActivityTurn
  readonly openPath: OpenPath
  readonly t: ResearchTranslate
}): React.JSX.Element {
  return (
    <article className="rl-activity-turn" data-status={turn.status}>
      <header className="rl-activity-head">
        <StatusMark status={turn.status} t={t} />
        <span className="rl-activity-headline">{turn.headline ?? t('activity.untitled')}</span>
      </header>
      <ol className="rl-activity-steps">
        {turn.steps.map(step => <StepRow key={step.callId} step={step} t={t} />)}
      </ol>
      {turn.dropped === 0 ? null : <p className="rl-muted">{t('activity.more', { count: turn.dropped })}</p>}
      {turn.files.length === 0
        ? null
        : (
          <p className="rl-activity-files">
            <span className="rl-muted">{t('activity.files')}</span>
            {turn.files.map(path => <FileLink key={path} path={path} label={path} openPath={openPath} />)}
          </p>
        )}
    </article>
  )
}

/** Props of {@link ActivitySection}. */
export interface ActivitySectionProps {
  readonly view: ActivityView | undefined
  /** Whether the notebook also shows loop runs or rounds; the activity then starts collapsed unless its latest turn is running. */
  readonly secondary: boolean
  /** Most turns to show; the pane passes {@link PANE_TURNS}. */
  readonly limit?: number | undefined
  readonly openPath: OpenPath
  readonly t: ResearchTranslate
}

/** Render the activity outside loops, newest turn first; nothing without activity. */
export function ActivitySection({ view, secondary, limit, openPath, t }: ActivitySectionProps): React.JSX.Element | null {
  const turns = [...(view?.turns ?? [])].reverse().slice(0, limit)
  const latest = turns[0]
  if (latest === undefined) return null
  const body = (
    <>
      <p className="rl-muted">{t('activity.hint')}</p>
      {turns.map(turn => <TurnEntry key={turn.turn} turn={turn} openPath={openPath} t={t} />)}
    </>
  )
  return (
    <section className="rl-run rl-activity" data-status={latest.status}>
      {secondary
        ? (
          <details className="rl-activity-details" open={latest.status === 'running'}>
            <summary className="rl-section-title">{t('activity.title')}</summary>
            {body}
          </details>
        )
        : (
          <>
            <h3 className="rl-section-title">{t('activity.title')}</h3>
            {body}
          </>
        )}
    </section>
  )
}

/** Render the dock strip while the latest activity turn runs; nothing otherwise. */
export function ActivityDockStrip({ view, openNotebook, t }: {
  readonly view: ActivityView | undefined
  readonly openNotebook: () => void
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const turn = view?.turns[view.turns.length - 1]
  if (turn?.status !== 'running') return null
  const step = turn.steps[turn.steps.length - 1]
  const time = elapsed(turn.startedAt, turn.endedAt, Date.now())
  return (
    <button type="button" className="rl-dock" onClick={openNotebook}>
      <StatusMark status={turn.status} t={t} />
      <span className="rl-dock-title">{t('dock.activity')}</span>
      {step === undefined ? null : <span className="rl-activity-label">{step.label}</span>}
      {time === undefined ? null : <span className="rl-elapsed">{formatDuration(time)}</span>}
      <span className="rl-dock-open">{t('dock.open')}</span>
    </button>
  )
}
