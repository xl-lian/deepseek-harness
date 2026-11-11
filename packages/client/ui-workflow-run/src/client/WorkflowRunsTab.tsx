import { useEffect, useState } from 'react'
import { StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkflowRunOutlineEntry } from '@deepseek-ai/dsh-workflow-run-outline/client'
import { formatDuration, formatMetric } from './format.ts'
import css from './WorkflowRunsTab.module.css'

/** Props of the Runs right-sidebar tab body. */
export type WorkflowRunsTabProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'workflowRun'>

type RunState = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

function runState(run: WorkflowRunOutlineEntry): RunState {
  if (run.interrupted) return 'interrupted'
  switch (run.stopReason) {
    case undefined: return 'running'
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    case 'error': return 'failed'
    /* v8 ignore next -- WorkflowStopReason is closed and every variant is handled above. */
    default: return run.stopReason satisfies never
  }
}

const DOT_STATES: Record<RunState, StateDotState> = {
  running: 'ongoing',
  completed: 'done',
  failed: 'error',
  cancelled: 'warning',
  interrupted: 'warning',
}

function runDuration(run: WorkflowRunOutlineEntry, state: RunState, now: number): number | null {
  if (run.endedAt !== undefined) return run.endedAt - run.startedAt
  return state === 'running' ? now - run.startedAt : null
}

/** Metric names across runs, in first-recorded order. */
function metricNames(runs: readonly WorkflowRunOutlineEntry[]): readonly string[] {
  return [...new Set(runs.flatMap(run => Object.keys(run.metrics)))]
}

/** A value's change from the nearest earlier run that recorded the same metric. */
function metricDelta(runs: readonly WorkflowRunOutlineEntry[], index: number, name: string): string | null {
  const current = runs[index]?.metrics[name]
  const previous = runs.slice(0, index).findLast(run => run.metrics[name] !== undefined)?.metrics[name]
  if (current === undefined || previous === undefined) return null
  const delta = current.latest - previous.latest
  return delta > 0 ? `+${formatMetric(delta)}` : formatMetric(delta)
}

function Sparkline({ values, label }: { readonly values: readonly number[]; readonly label: string }) {
  if (values.length < 2) return null
  const low = Math.min(...values)
  const range = Math.max(...values) - low
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 48
    const y = range === 0 ? 7 : 13 - ((value - low) / range) * 12
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className={css.sparkline} viewBox="0 0 48 14" role="img" aria-label={label} data-metric-sparkline>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

/** Render one row per workflow run in the Session. */
export function WorkflowRunsTab({ useProjection, t }: WorkflowRunsTabProps) {
  const runs = useProjection('workflowRuns') ?? []
  const live = runs.some(run => runState(run) === 'running')
  const [now, setNow] = useState(() => Date.now())
  // The clock only runs while a row can still move.
  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [live])

  const names = metricNames(runs)
  if (runs.length === 0) return <div className={css.empty}>{t('runs.empty')}</div>
  return (
    <div className={css.root} data-workflow-runs>
      <table className={css.table}>
        <thead>
          <tr>
            <th scope="col">{t('runs.column.run')}</th>
            <th scope="col">{t('runs.column.status')}</th>
            <th scope="col">{t('runs.column.duration')}</th>
            <th scope="col">{t('runs.column.members')}</th>
            {names.map(name => (
              <th scope="col" key={name}>
                <span className={css.metricHeader}>
                  {name}
                  <Sparkline
                    label={t('runs.trend', { name })}
                    values={runs.flatMap(run => run.metrics[name] === undefined ? [] : [run.metrics[name].latest])}
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const state = runState(run)
            const duration = runDuration(run, state, now)
            return (
              <tr key={run.runId} data-run-state={state}>
                <td>
                  <div className={css.name}>{run.name}</div>
                  {run.currentPhase === undefined ? null : <div className={css.phase}>{run.currentPhase}</div>}
                </td>
                <td>
                  <span className={css.status}>
                    <StateDot state={DOT_STATES[state]} />
                    {t(`status.${state}`)}
                  </span>
                </td>
                <td className={css.numeric}>{duration === null ? '–' : formatDuration(duration, t)}</td>
                <td className={css.numeric}>{`${run.members.completed}/${run.members.started}`}</td>
                {names.map((name) => {
                  const metric = run.metrics[name]
                  const delta = metricDelta(runs, index, name)
                  return (
                    <td className={css.numeric} key={name} title={metric === undefined ? undefined : String(metric.latest)}>
                      {metric === undefined ? '–' : formatMetric(metric.latest)}
                      {delta === null ? null : <span className={css.delta}>{delta}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
