import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconGoalOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge for the composer tool row.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './GoalModeChip.module.css'

/** Composer-row chip props: the Session standard kit and the goal locale seat. */
export type GoalModeChipProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'goal'>

/**
 * Status chip in the composer tool row while the projected goal is active,
 * marking that sent messages steer an automatically continuing goal. Goal
 * controls stay on the goal strip, so the chip itself takes no action.
 */
export function GoalModeChip({ useProjection, t }: GoalModeChipProps) {
  const active = useProjection('goal', goal => goal != null && goal.goal.phase === 'active')
  return active ? <GoalModeBadge t={t} /> : null
}

/** The chip's visible label with its explanation as the native tooltip. */
export function GoalModeBadge({ t }: Pick<GoalModeChipProps, 't'>) {
  return (
    <span className={css.chip} data-goal-mode title={t('chip.tooltip')}>
      <span className={css.glyph} aria-hidden><IconGoalOutlineRegular size={14} /></span>
      {t('chip.goalMode')}
    </span>
  )
}
