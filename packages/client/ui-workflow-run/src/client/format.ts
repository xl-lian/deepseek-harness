import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

type Translate = PropsLocale<'workflowRun'>['t']

/**
 * Render a metric value for a table cell, keeping six significant digits.
 * @param value - a finite number.
 * @returns compact digits; the exact value belongs in the cell's title.
 */
export function formatMetric(value: number): string {
  return String(Number(value.toPrecision(6)))
}

/**
 * Render an elapsed time with the coarsest two units.
 * @param elapsedMs - elapsed milliseconds; negative clock skew renders as zero.
 * @param t - this namespace's translate.
 * @returns localized duration text.
 */
export function formatDuration(elapsedMs: number, t: Translate): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return t('duration.hours', { hours, minutes })
  return minutes > 0 ? t('duration.minutes', { minutes, seconds }) : t('duration.seconds', { seconds })
}
