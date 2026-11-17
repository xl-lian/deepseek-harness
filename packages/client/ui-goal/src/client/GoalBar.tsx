/**
 * GoalBar: the goal indicator docked above the message composer (input dock
 * strip). A present goal shows a goal glyph, a phase label, a run-state dot,
 * the admitted round count, the truncated objective, and icon actions —
 * resume when active-disarmed or paused, edit (inline form in the same
 * strip), and clear. Activating the summary expands the strip to show the
 * full objective and, for a blocked goal, its reason. Goal creation lives on
 * the `/goal` command, not here: loading (undefined), no goal (null), and
 * complete goals render nothing. Durable state arrives as the projected whole
 * snapshot; process-local activation arrives through the injected activation
 * hook.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { GoalActivation, GoalSnapshot } from '@deepseek-ai/dsh-goal/client'
import {
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular,
  IconEditOutlineRegular, IconGoalOutlineRegular, IconPauseOutlineRegular, IconPlayOutlineRegular,
  IconTrashOutlineRegular, InlineEditor, StateDot, Tooltip, type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GoalActionResult, GoalBarActions, GoalBarInjected } from './slots.ts'
import type { GoalKey } from './locales.ts'
import css from './GoalBar.module.css'

export interface GoalBarProps extends GoalBarActions {
  /** Current goal snapshot; undefined = capability absent or loading, null = no goal set. */
  goal: GoalSnapshot | null | undefined
  /** Process-local continuation activation; absent while the live read is pending. */
  activation?: GoalActivation
  /** Admitted goal rounds from the projection; absent hides the round count. */
  roundsStarted?: number
  /** Whether the Session is running a turn; absent counts as not running. */
  running?: boolean
}

/**
 * Map durable phase, activation, and Session run state onto the shared status
 * dot. Complete goals never reach the strip, so the remaining phase is active.
 */
function runState(goal: GoalSnapshot, activation: GoalActivation | undefined, running: boolean): StateDotState {
  if (goal.phase === 'blocked') return 'error'
  if (goal.phase === 'paused' || activation === 'disarmed') return 'warning'
  return running && activation === 'armed' ? 'ongoing' : 'idle'
}

/** Strip label keys per visible phase; complete goals render nothing. */
const PHASE_LABELS = {
  active: 'phase.active',
  paused: 'phase.paused',
  blocked: 'phase.blocked',
} as const satisfies Record<string, GoalKey>

/** Strip label for an active goal using its process-local activation. */
function activeLabel(activation: GoalActivation | undefined, t: TranslateNS<'goal'>): string {
  if (activation === 'disarmed') return t('phase.active.disarmed')
  return t(PHASE_LABELS.active)
}

export function GoalBar({
  goal, activation, roundsStarted, running = false, onEdit, onPause, onResume, onClear, t,
}: GoalBarProps & PropsLocale<'goal'>) {
  const detailsId = useId()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [clearedGoalId, setClearedGoalId] = useState<GoalSnapshot['id'] | null>(null)
  const pendingRef = useRef(false)

  // A new goal identity (cleared/completed/replaced externally) invalidates the local edit
  // state: without the reset a surviving draft's Enter would write over the NEW goal.
  const goalId = goal?.id
  useEffect(() => {
    setEditing(false)
    setExpanded(false)
    setActionError(null)
    setClearedGoalId(null)
  }, [goalId])

  // React state disables the controls on the next render; the ref closes the
  // same-render window so rapid clicks cannot submit the same CAS twice.
  const runAction = useCallback(async (action: () => Promise<GoalActionResult>): Promise<GoalActionResult | undefined> => {
    if (pendingRef.current) return undefined
    pendingRef.current = true
    setPending(true)
    setActionError(null)
    const result = await action()
    pendingRef.current = false
    setPending(false)
    if (!result.ok) setActionError(`${result.error.message} (${result.error.code})`)
    return result
  }, [])

  const handleEdit = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === '') return
    const result = await runAction(() => onEdit(trimmed))
    if (result?.ok) setEditing(false)
  }, [draft, onEdit, runAction])

  const handleClear = useCallback(async (clearedId: GoalSnapshot['id']) => {
    const result = await runAction(onClear)
    if (result?.ok) setClearedGoalId(clearedId)
  }, [onClear, runAction])

  // Loading, absent, and complete goals have no strip at all.
  if (goal === undefined || goal === null || goal.phase === 'complete' || goal.id === clearedGoalId) return null

  if (editing) {
    return (
      <div className={css.dock} data-goal-bar>
        <div className={`${css.bar} ${css.editBar}`}>
          <InlineEditor
            value={draft}
            label={t('objective.aria')}
            onChange={setDraft}
            onSave={() => { void handleEdit() }}
            onCancel={() => { setEditing(false) }}
          />
          {actionError !== null && <span className={css.error} role="alert">{actionError}</span>}
          <div className={css.actions}>
            <Tooltip portal label={t('action.save')} side="bottom" delayMs={500}>
              <button
                type="button"
                className={css.iconBtn}
                onClick={() => { void handleEdit() }}
                disabled={pending || draft.trim() === ''}
                aria-label={t('action.save')}
              >
                <IconCheckOutlineRegular size={14} />
              </button>
            </Tooltip>
            <Tooltip portal label={t('action.cancel')} side="bottom" delayMs={500}>
              <button
                type="button"
                className={css.iconBtn}
                onClick={() => { setEditing(false) }}
                disabled={pending}
                aria-label={t('action.cancel')}
              >
                <IconCloseOutlineRegular size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    )
  }

  const blockedReason = goal.phase === 'blocked' ? goal.blockedReason?.message : undefined
  const label = goal.phase === 'active' ? activeLabel(activation, t) : t(PHASE_LABELS[goal.phase])
  const state = runState(goal, activation, running)
  // Only the two armed states add information the phase label lacks.
  const stateLabel = state === 'ongoing' ? t('state.running') : state === 'idle' && activation === 'armed' ? t('state.waiting') : undefined
  const showResume = goal.phase === 'paused'
    || (goal.phase === 'active' && activation === 'disarmed')
  return (
    <div className={css.dock} data-goal-bar>
      <div className={css.bar} title={blockedReason} data-expanded={expanded || undefined} data-state={state}>
        <div className={css.row}>
          <button
            type="button"
            className={css.summary}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => { setExpanded(value => !value) }}
          >
            <span className={css.goalGlyph} aria-hidden><IconGoalOutlineRegular size={14} /></span>
            <span className={css.label}>{label}</span>
            <span
              className={css.stateDot}
              {...stateLabel === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': stateLabel, title: stateLabel }}
            >
              <StateDot state={state} size={state === 'ongoing' ? 12 : 8} />
            </span>
            {roundsStarted !== undefined && (
              <span className={css.rounds}>{t('rounds', { count: roundsStarted, max: goal.maxGoalRounds })}</span>
            )}
            <span className={css.objective}>{goal.objective}</span>
            <span className={css.chevron} aria-hidden>
              {expanded ? <IconChevronUpOutlineRegular size={12} /> : <IconChevronDownOutlineRegular size={12} />}
            </span>
          </button>
          {actionError !== null && <span className={css.error} role="alert">{actionError}</span>}
          <div className={css.actions}>
            {goal.phase === 'active' && activation === 'armed' && (
              <Tooltip portal label={t('action.pause')} side="bottom" delayMs={500}>
                <button type="button" className={css.iconBtn} disabled={pending} onClick={() => { void runAction(onPause) }} aria-label={t('action.pause')}>
                  <IconPauseOutlineRegular size={14} />
                </button>
              </Tooltip>
            )}
            {showResume && (
              <Tooltip portal label={t('action.resume')} side="bottom" delayMs={500}>
                <button type="button" className={css.iconBtn} disabled={pending} onClick={() => { void runAction(onResume) }} aria-label={t('action.resume')}>
                  <IconPlayOutlineRegular size={14} />
                </button>
              </Tooltip>
            )}
            <Tooltip portal label={t('action.edit')} side="bottom" delayMs={500}>
              <button
                type="button"
                className={css.iconBtn}
                disabled={pending}
                onClick={() => { setDraft(goal.objective); setEditing(true) }}
                aria-label={t('action.edit')}
              >
                <IconEditOutlineRegular size={14} />
              </button>
            </Tooltip>
            <Tooltip portal label={t('action.clear')} side="bottom" delayMs={500}>
              <button type="button" className={css.iconBtn} disabled={pending} onClick={() => { void handleClear(goal.id) }} aria-label={t('action.clear')}>
                <IconTrashOutlineRegular size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
        {expanded && (
          <div id={detailsId} className={css.details}>
            <p className={css.fullObjective}>{goal.objective}</p>
            {blockedReason !== undefined && (
              <p className={css.reason}>
                <span className={css.reasonLabel}>{t('blocked.reason')}</span>
                {blockedReason}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Full props of the dock entry: InputZone owner share + injected verbs/activation hook + the locale seat. */
export type GoalDockProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & InjectFace<GoalBarInjected>
  & PropsLocale<'goal'>

/** Dock adapter: overlays process-local activation on the durable goal projection. */
export function GoalDock({
  useProjection, useSession, useGoalActivation, onEdit, onPause, onResume, onClear, t,
}: GoalDockProps) {
  const projection = useProjection('goal')
  const goal = projection === undefined || projection === null ? projection : projection.goal
  const roundsStarted = projection === undefined || projection === null ? undefined : projection.roundsStarted
  const running = useSession(session => session.running)
  const goalId = goal?.id
  const revision = goal?.revision
  const activation = useGoalActivation(next => (
    next.id === goalId && next.revision === revision ? next.activation : undefined
  ))

  return (
    <GoalBar
      goal={goal}
      {...activation === undefined ? {} : { activation }}
      {...roundsStarted === undefined ? {} : { roundsStarted }}
      running={running}
      onEdit={onEdit}
      onPause={onPause}
      onResume={onResume}
      onClear={onClear}
      t={t}
    />
  )
}
