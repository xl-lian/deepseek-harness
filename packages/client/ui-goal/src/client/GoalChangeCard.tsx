import { memo } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCheckOutlineRegular, IconGoalOutlineRegular, IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GoalChangeCardData, GoalChangeCardOperation } from './goal-change.ts'
import type { GoalKey } from './locales.ts'
import css from './GoalChangeCard.module.css'

type GoalChangeCardProps = PropsRuntime<'conversation.chat.node', 'goal-change'> & PropsLocale<'goal'>

const TITLES = {
  create: 'card.created',
  complete: 'card.complete',
  block: 'card.blocked',
} as const satisfies Record<GoalChangeCardOperation, GoalKey>

const ICONS = {
  create: IconGoalOutlineRegular,
  complete: IconCheckOutlineRegular,
  block: IconWarningOutlineRegular,
} as const satisfies Record<GoalChangeCardOperation, unknown>

/** Meta line: the round budget a new goal starts with, or the rounds a finished one used. */
function meta(data: GoalChangeCardData, t: GoalChangeCardProps['t']): string {
  return data.operation === 'create'
    ? t('card.limit', { max: data.maxGoalRounds })
    : t('rounds', { count: data.roundsStarted, max: data.maxGoalRounds })
}

/**
 * Goal milestone card in the transcript: what was set, achieved, or blocked,
 * with the objective and its round budget or usage.
 */
export function GoalChangeCardView({ data, t }: { data: GoalChangeCardData; t: GoalChangeCardProps['t'] }) {
  const Icon = ICONS[data.operation]
  return (
    <section className={css.card} data-goal-change={data.operation} aria-label={t('card.aria')}>
      <header className={css.header}>
        <span className={css.icon} aria-hidden><Icon size={14} /></span>
        <span className={css.title}>{t(TITLES[data.operation])}</span>
        <span className={css.meta}>{meta(data, t)}</span>
      </header>
      <p className={css.objective}>{data.objective}</p>
      {data.blockedReason !== undefined && (
        <p className={css.reason}>
          <span className={css.reasonLabel}>{t('blocked.reason')}</span>
          {data.blockedReason}
        </p>
      )}
    </section>
  )
}

/** Chat node renderer for the `goal-change` kind. */
export const GoalChangeCard = memo(function GoalChangeCard({ node, t }: GoalChangeCardProps) {
  return <GoalChangeCardView data={node.data} t={t} />
})
