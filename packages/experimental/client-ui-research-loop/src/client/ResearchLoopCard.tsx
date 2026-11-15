/**
 * Chat card at a `research-loop` run start: each round's stage rail with its
 * experiments' verdicts, the stop reason, and the write-up answer.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './definition.ts'
import { ledgerRound } from './model.ts'
import type { ResearchView } from '../shared/schema.ts'
import { StageRail, StatusMark, VerdictBadge, type ResearchTranslate } from './parts.tsx'

/** Actions injected for the card. */
export interface ResearchLoopCardInjected {
  /** Select the notebook view tab. */
  readonly openNotebook: () => void
}

/** Complete keyed Chat renderer props for the card. */
export type ResearchLoopCardProps =
  & PropsRuntime<'conversation.chat.node', 'research-loop'>
  & PropsLocale<'researchLoop'>
  & ResearchLoopCardInjected

/** Chat node slot occupant: reads the projection and renders {@link CardBody} for its run. */
export function ResearchLoopCard({ node, useProjection, openNotebook, t }: ResearchLoopCardProps): React.JSX.Element | null {
  return <CardBody view={useProjection('scienceResearchLoop')} runId={node.data.runId} openNotebook={openNotebook} t={t} />
}

/** Render one loop run's compact card. */
export function CardBody({ view, runId, openNotebook, t }: ResearchLoopCardInjected & {
  readonly view: ResearchView | undefined
  readonly runId: string
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const run = view?.runs.find(candidate => candidate.runId === runId)
  if (view === undefined || run === undefined) return null
  return (
    <article className="rl-card" data-status={run.status}>
      <header className="rl-card-head">
        <StatusMark status={run.status} t={t} />
        <span className="rl-card-title">{t('title')}</span>
        <span className="rl-muted">{t(`status.${run.status}`)}</span>
        <button type="button" className="rl-link rl-card-open" onClick={openNotebook}>{t('card.open')}</button>
      </header>
      {run.rounds.map((round) => {
        const ledger = ledgerRound(view, round)
        return (
          <div key={round.number} className="rl-card-round">
            <span className="rl-card-round-title">{t('round.title', { number: round.number })}</span>
            <StageRail round={round} t={t} compact />
            <div className="rl-chips">
              {round.experiments.map(experiment => (
                <span key={experiment.id} className="rl-card-exp">
                  <code>{experiment.id}</code>
                  {experiment.verdict === undefined ? null : <VerdictBadge verdict={experiment.verdict} t={t} />}
                  {ledger?.experiments.find(entry => entry.id === experiment.id)?.evidenceClass === 'exploratory'
                    ? <span className="rl-evidence" data-evidence="exploratory">{t('evidence.exploratory')}</span>
                    : null}
                </span>
              ))}
            </div>
          </div>
        )
      })}
      {run.answer === undefined ? null : <p className="rl-card-answer">{run.answer}</p>}
    </article>
  )
}
