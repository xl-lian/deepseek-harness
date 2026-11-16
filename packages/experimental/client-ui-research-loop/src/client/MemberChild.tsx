/**
 * Expanded member detail read from the member's own child Session: the agent's
 * result and the tool steps it took. The child is retained only while the row
 * is expanded and is released when it collapses or unmounts.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SessionEventSource, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import { childSummary, type ChildStep, type ChildSummary } from './child.ts'
import type { ResearchTranslate } from './parts.tsx'

/**
 * Retain one child Session of the mounted parent until `signal` aborts.
 * @param childId - child Session id recorded on the member.
 * @param signal - aborted when the caller no longer needs the child.
 * @returns the retained reference; the caller releases it.
 */
export type RetainChild = (childId: string, signal: AbortSignal) => SessionReference

const STEP_MARK: Readonly<Record<ChildStep['status'], string>> = { running: '…', ok: '✓', error: '✗' }

/** Render a child summary; `loading` is true until the child's first events arrive. */
export function ChildSummaryView({ summary, loading, t }: {
  readonly summary: ChildSummary
  readonly loading: boolean
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const { result, steps } = summary
  if (result === undefined && steps.length === 0) {
    return <p className="rlc-muted rlc-child-empty">{t(loading ? 'campaign.child.loading' : 'campaign.child.empty')}</p>
  }
  return (
    <div className="rlc-child">
      {result === undefined ? null : (
        <div className="rlc-child-result" data-kind={result.kind}>
          <span className="rlc-label">{t(result.kind === 'structured' ? 'campaign.child.result' : 'campaign.child.finalMessage')}</span>
          <pre>{result.text}</pre>
        </div>
      )}
      {steps.length === 0 ? null : (
        <div className="rlc-child-steps">
          <span className="rlc-label">{t('campaign.child.steps', { count: String(steps.length) })}</span>
          <ol>
            {steps.map(step => (
              <li key={step.callId} data-status={step.status}>
                <details>
                  <summary>
                    <span className="rlc-child-mark" aria-hidden="true">{STEP_MARK[step.status]}</span>
                    <code>{step.name}</code>
                    <span className="rlc-child-args">{step.argumentsLine}</span>
                  </summary>
                  {step.result === undefined || step.result === ''
                    ? <p className="rlc-muted">{t(`status.${step.status === 'running' ? 'running' : 'completed'}`)}</p>
                    : <pre>{step.result}</pre>}
                </details>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function ChildEvents({ source, t }: {
  readonly source: SessionEventSource
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const events = useSyncExternalStore(
    listener => source.subscribe(listener),
    () => source.getSnapshot(),
  )
  const summary = useMemo(() => childSummary(events.entries), [events])
  return <ChildSummaryView summary={summary} loading={events.entries.length === 0} t={t} />
}

/** Retain a member's child Session and render what its agent did. */
export function MemberChildDetail({ childId, retainChild, t }: {
  readonly childId: string
  readonly retainChild: RetainChild
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const [reference, setReference] = useState<SessionReference | undefined>(undefined)
  // Injected callbacks may be recreated per render; only the child id decides the retained Session.
  const retain = useRef(retainChild)
  retain.current = retainChild
  useEffect(() => {
    const controller = new AbortController()
    const next = retain.current(childId, controller.signal)
    setReference(next)
    return () => {
      controller.abort()
      next.release()
    }
  }, [childId])
  if (reference === undefined) return <p className="rlc-muted rlc-child-empty">{t('campaign.child.loading')}</p>
  return <ChildEvents source={reference.binding.eventSource} t={t} />
}
