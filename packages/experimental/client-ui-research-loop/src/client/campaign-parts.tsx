/**
 * Rendering parts for campaign rounds in the notebook and the Chat card: stage
 * summaries, stage detail sections, member rows, verifier results by check
 * outcome, and the round extras attached to each stage.
 */

import { useState } from 'react'
import {
  type LoopCandidate,
  type LoopCheck,
  type LoopMember,
  type LoopReportIssue,
  type LoopRound,
  type LoopStage,
  type StageId,
} from '../shared/campaign-types.ts'
import { experimentKeyOf, latestAttempts } from '../shared/stage.ts'
import type { LoopExperiment, LoopExperimentOutcome } from './experiments.ts'
import type { ResearchLoopKey } from './locales.ts'
import { formatDuration } from './model.ts'
import type { ResearchTranslate } from './parts.tsx'
import { MemberChildDetail, type RetainChild } from './MemberChild.tsx'

/** Open a workspace-relative file in the right Sidebar. */
export type OpenFile = (path: string, options?: { readonly line?: number }) => void

/** Render 1–3 summary lines for a stage card. */
export function StageSummaryLines({ lines, className }: {
  readonly lines: readonly string[]
  readonly className?: string
}): React.JSX.Element | null {
  if (lines.length === 0) return null
  return (
    <span className={className === undefined ? 'rlc-summary' : `rlc-summary ${className}`}>
      {lines.map((line, index) => (
        <span key={`${index}:${line}`} className="rlc-summary-line">{line}</span>
      ))}
    </span>
  )
}

function extrasAvailable(stageId: StageId, round: LoopRound): boolean {
  switch (stageId) {
    case 'scout': return round.scout !== undefined
    case 'hypotheses': return (round.hypotheses?.length ?? 0) > 0
    case 'statistician': return round.l3 !== undefined || round.design !== undefined
    case 'decide': return round.decision !== undefined
    case 'report': return round.report !== undefined
    default: return false
  }
}

function isTerminal(round: LoopRound): boolean {
  return round.status === 'completed' || round.status === 'failed' || round.status === 'cancelled'
    || round.status === 'interrupted' || round.status === 'blocked'
}

/**
 * Stage details shared by the card and the large views.
 * With `experiment`, the Verifier lists each check by result and Decide states
 * what happened to this experiment's runs.
 */
export function StageDetails({ stage, round, openFile, openSessionFor, t, summaryLines, experiment, retainChild }: {
  readonly stage: LoopStage
  readonly round: LoopRound
  readonly openFile: OpenFile
  readonly openSessionFor: (childId: string) => void
  readonly t: ResearchTranslate
  readonly summaryLines?: readonly string[]
  readonly experiment?: LoopExperiment | undefined
  /** Lets member rows expand their child Session in place. */
  readonly retainChild?: RetainChild | undefined
}): React.JSX.Element {
  const extras = extrasAvailable(stage.id, round)
  const ownRunIds = experiment?.hypothesisId === undefined ? undefined : experiment.runIds
  return (
    <div className="rlc-details">
      {summaryLines === undefined ? null : <StageSummaryLines lines={summaryLines} className="rlc-details-summary" />}
      {experiment !== undefined && stage.id === 'verifier' ? <VerifierResults stage={stage} t={t} /> : null}
      {experiment?.hypothesisId !== undefined && stage.id === 'decide' && round.decision !== undefined
        ? <OutcomeLine outcome={experiment.outcome} t={t} />
        : null}
      <RoundExtras stageId={stage.id} round={round} openFile={openFile} t={t} ownRunIds={ownRunIds} />
      {stage.members.length === 0
        ? (extras ? null : <p className="rlc-empty">{isTerminal(round) ? t('campaign.stage.emptyIdle') : t('campaign.stage.emptyPending')}</p>)
        : (
          <ul className="rlc-members">
            {stage.members.map(member => (
              <li key={member.id} className="rlc-member" data-status={member.status}>
                <MemberRow member={member} openFile={openFile} openSessionFor={openSessionFor} t={t} retainChild={retainChild} />
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

function Kvs({ t, entries }: {
  readonly t: ResearchTranslate
  readonly entries: readonly (readonly [ResearchLoopKey, string | undefined])[]
}): React.JSX.Element | null {
  const present = entries.filter((entry): entry is readonly [ResearchLoopKey, string] => entry[1] !== undefined && entry[1] !== '')
  if (present.length === 0) return null
  return (
    <dl className="rlc-kv">
      {present.map(([key, value]) => (
        <div key={key} className="rlc-kv-row">
          <dt>{t(key)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function metricLines(metrics: Readonly<Record<string, number>> | undefined): string {
  if (metrics === undefined) return ''
  return Object.entries(metrics)
    .slice(0, 6)
    .map(([key, value]) => `${key}=${Number.isInteger(value) ? value : value.toFixed(4)}`)
    .join(' · ')
}

function memberMetricsLine(member: LoopMember): string | undefined {
  const verified = metricLines(member.metricsVerified)
  if (verified.length > 0) return `${verified} (verified)`
  const reported = metricLines(member.metrics)
  return reported.length > 0 ? reported : undefined
}

/** One member row with its plan, metrics, checks, actions, and raw output. */
export function MemberRow({ member, openFile, openSessionFor, t, retainChild }: {
  readonly member: LoopMember
  readonly openFile: OpenFile
  readonly openSessionFor: (childId: string) => void
  readonly t: ResearchTranslate
  /** With a child Session on the member, makes the head expand the child's result and steps in place. */
  readonly retainChild?: RetainChild | undefined
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const runIds = member.runIds ?? []
  const metrics = memberMetricsLine(member)
  // A sub-second span means the start and end were logged together, not a real duration.
  const elapsed = member.startedAt === undefined ? undefined : (member.endedAt ?? Date.now()) - member.startedAt
  const childId = retainChild === undefined ? undefined : member.childId
  const head = (
    <>
      <span className="rl-dot" data-status={member.status} aria-hidden="true" />
      <span className="rlc-member-label">{member.label}</span>
      {member.label.replaceAll('_', '-') === member.role
        ? null
        : <span className="rlc-member-role">{member.role}</span>}
      <span className={member.status === 'completed' ? 'rlc-sr' : 'rlc-member-status'}>
        {t(`status.${member.status}`)}
      </span>
      {member.verdict === undefined
        ? null
        : <span className="rlc-verdict" data-verdict={member.verdict}>{member.verdict}</span>}
      {member.repaired === true
        ? <span className="rlc-tag">{t('campaign.detail.repaired')}</span>
        : null}
      {elapsed === undefined || elapsed < 1000
        ? null
        : <span className="rlc-member-time">{formatDuration(elapsed)}</span>}
    </>
  )
  return (
    <>
      {childId === undefined
        ? <div className="rlc-member-head">{head}</div>
        : (
          <button
            type="button"
            className="rlc-member-head rlc-member-toggle"
            aria-expanded={expanded}
            onClick={() => { setExpanded(value => !value) }}
          >
            <span className="rlc-member-chevron" aria-hidden="true" />
            {head}
          </button>
        )}
      {childId === undefined || retainChild === undefined || !expanded
        ? null
        : <MemberChildDetail childId={childId} retainChild={retainChild} t={t} />}
      {member.statusDetail === undefined
        ? null
        : <p className="rlc-muted rlc-status-detail">{member.statusDetail}</p>}
      {member.plan === undefined
        ? null
        : (
          <div className="rlc-plan">
            <span className="rlc-label">{t('campaign.detail.plan')}</span>
            <p>{member.plan}</p>
          </div>
        )}
      {member.notes === undefined
        ? null
        : (
          <div className="rlc-notes">
            <span className="rlc-label">{t('campaign.detail.notes')}</span>
            <p>{member.notes}</p>
          </div>
        )}
      {metrics === undefined
        ? null
        : (
          <div className="rlc-metrics">
            <span className="rlc-label">{member.metricsVerified === undefined ? t('campaign.detail.metrics') : t('campaign.detail.verifiedMetrics')}</span>
            <code>{metrics}</code>
          </div>
        )}
      {member.trust === undefined && (member.blockingFailures?.length ?? 0) === 0 && (member.warnings?.length ?? 0) === 0
        ? null
        : (
          <div className="rlc-flags">
            {member.trust === undefined ? null : (
              <span className="rlc-flag" data-kind="trust">
                {t('campaign.detail.trust')}
                {' '}
                {member.trust}
              </span>
            )}
            {(member.blockingFailures ?? []).map(failure => (
              <span key={`b:${failure}`} className="rlc-flag" data-kind="blocking">
                {t('campaign.detail.blocking')}
                {': '}
                {failure}
              </span>
            ))}
            {(member.warnings ?? []).map(warning => (
              <span key={`w:${warning}`} className="rlc-flag" data-kind="warning">
                {t('campaign.detail.warnings')}
                {': '}
                {warning}
              </span>
            ))}
          </div>
        )}
      {member.checks === undefined || member.checks.length === 0
        ? null
        : <ChecksList checks={member.checks} t={t} />}
      {(member.files?.length ?? 0) === 0
        ? null
        : (
          <div className="rlc-files">
            <span className="rlc-label">{t('campaign.detail.files')}</span>
            {member.files?.map(file => (
              <button key={file} type="button" className="rlc-file" onClick={() => { openFile(file) }}>
                {file}
              </button>
            ))}
          </div>
        )}
      {member.summary === undefined || member.summary === member.plan || member.summary === member.notes
        ? null
        : <p className="rlc-member-summary">{member.summary}</p>}
      <div className="rlc-member-actions">
        {member.childId === undefined
          ? null
          : (
            <button type="button" onClick={() => { openSessionFor(member.childId as string) }}>
              {t('campaign.member.openSession')}
            </button>
          )}
        {runIds.map(runId => (
          <button key={`${member.id}:${runId}:verdict`} type="button" onClick={() => { openFile(`runs/${runId}/verdict.json`) }}>
            {`${t('campaign.member.verdict')} ${runId}`}
          </button>
        ))}
        {runIds.map(runId => (
          <button key={`${member.id}:${runId}:logs`} type="button" onClick={() => { openFile(`runs/${runId}/logs/stdout.log`) }}>
            {`${t('campaign.member.logs')} ${runId}`}
          </button>
        ))}
      </div>
      {member.output === undefined
        ? null
        : (
          <details className="rlc-output">
            <summary>{t('campaign.member.output')}</summary>
            <pre>{member.output}</pre>
          </details>
        )}
    </>
  )
}

function ChecksList({ checks, t }: {
  readonly checks: readonly LoopCheck[]
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const byLayer = new Map<string, LoopCheck[]>()
  for (const check of checks) {
    const list = byLayer.get(check.layer) ?? []
    list.push(check)
    byLayer.set(check.layer, list)
  }
  return (
    <details className="rlc-checks">
      <summary>
        {t('campaign.detail.checks')}
        {' '}
        {`(${checks.length})`}
      </summary>
      {[...byLayer.entries()].map(([layer, list]) => (
        <div key={layer} className="rlc-check-layer">
          <span className="rlc-label">{layer === '' ? '—' : layer}</span>
          <ul>
            {list.map(check => (
              <li key={`${check.layer}:${check.checkId}`} className="rlc-check" data-status={check.status}>
                <span className="rlc-verdict" data-verdict={check.status === 'skip' ? undefined : check.status}>{check.status}</span>
                <code>{check.checkId}</code>
                {check.summary === undefined ? null : <span className="rlc-muted">{check.summary}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}

const RESULT_ORDER = ['fail', 'warn', 'pass', 'skip'] as const satisfies readonly LoopCheck['status'][]
const RESULT_KEY = {
  fail: 'campaign.verifier.failed',
  warn: 'campaign.verifier.warned',
  pass: 'campaign.verifier.passed',
  skip: 'campaign.verifier.skipped',
} as const satisfies Record<LoopCheck['status'], ResearchLoopKey>
const RESULT_MARK: Readonly<Record<LoopCheck['status'], string>> = { fail: '✗', warn: '!', pass: '✓', skip: '–' }

function ResultGroup({ result, count, t, children }: {
  readonly result: LoopCheck['status']
  readonly count: number
  readonly t: ResearchTranslate
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="rlc-vr-group" data-result={result}>
      <span className="rlc-label">{t(RESULT_KEY[result], { count: String(count) })}</span>
      <ul className="rlc-vr-checks">{children}</ul>
    </div>
  )
}

/** Checks of one verification grouped by result, failures first and blocking failures at their top. */
function CheckGroups({ member, t }: {
  readonly member: LoopMember
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const checks = member.checks ?? []
  if (checks.length === 0) {
    const flags = [
      ['fail', member.blockingFailures ?? []],
      ['warn', member.warnings ?? []],
    ] as const
    if (flags.every(([, list]) => list.length === 0)) {
      return member.verdict === undefined ? null : <p className="rlc-muted rlc-vr-none">{t('campaign.verifier.noChecks')}</p>
    }
    return (
      <>
        {flags.map(([result, list]) => list.length === 0 ? null : (
          <ResultGroup key={result} result={result} count={list.length} t={t}>
            {list.map(text => (
              <li key={text} className="rlc-vr-check" data-status={result}>
                <span className="rlc-vr-mark" aria-hidden="true">{RESULT_MARK[result]}</span>
                <span>{text}</span>
              </li>
            ))}
          </ResultGroup>
        ))}
      </>
    )
  }
  return (
    <>
      {RESULT_ORDER.map((result) => {
        const list = checks
          .filter(check => check.status === result)
          .sort((left, right) => Number(right.severity === 'blocking') - Number(left.severity === 'blocking'))
        if (list.length === 0) return null
        return (
          <ResultGroup key={result} result={result} count={list.length} t={t}>
            {list.map(check => (
              <li key={`${check.layer}:${check.checkId}`} className="rlc-vr-check" data-status={check.status}>
                <span className="rlc-vr-mark" aria-hidden="true">{RESULT_MARK[result]}</span>
                {check.layer === '' ? null : <span className="rlc-vr-layer">{check.layer}</span>}
                <code>{check.checkId}</code>
                {check.severity === 'blocking' ? <span className="rlc-tag" data-kind="blocking">{t('campaign.verifier.blockingTag')}</span> : null}
                {check.summary === undefined ? null : <span className="rlc-vr-summary">{check.summary}</span>}
              </li>
            ))}
          </ResultGroup>
        )
      })}
    </>
  )
}

/** Each hypothesis's verification attempts in start order, then the latest attempt's checks by result. */
function VerifierResults({ stage, t }: {
  readonly stage: LoopStage
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const latest = latestAttempts(stage)
  if (latest.length === 0) return null
  return (
    <div className="rlc-vr">
      {latest.map((member) => {
        const key = experimentKeyOf(member.label)
        const chain = key === undefined
          ? [member]
          : stage.members
            .filter(candidate => experimentKeyOf(candidate.label) === key)
            .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0))
        return (
          <section key={member.id} className="rlc-vr-attempt">
            <ol className="rlc-vr-chain" aria-label={t('campaign.verifier.attempts')}>
              {chain.map(attempt => (
                <li key={attempt.id} data-status={attempt.status}>
                  <code>{attempt.label}</code>
                  {attempt.verdict === undefined
                    ? <span className="rlc-muted">{t(`status.${attempt.status}`)}</span>
                    : <span className="rlc-verdict" data-verdict={attempt.verdict}>{attempt.verdict}</span>}
                </li>
              ))}
            </ol>
            {member.trust === undefined ? null : <p className="rlc-muted rlc-vr-trust">{`${t('campaign.detail.trust')} ${member.trust}`}</p>}
            <CheckGroups member={member} t={t} />
          </section>
        )
      })}
    </div>
  )
}

function OutcomeLine({ outcome, t }: {
  readonly outcome: LoopExperimentOutcome | undefined
  readonly t: ResearchTranslate
}): React.JSX.Element {
  if (outcome === undefined) return <p className="rlc-outcome" data-outcome="none">{t('campaign.outcome.none')}</p>
  switch (outcome.kind) {
    case 'chosen':
      return <p className="rlc-outcome" data-outcome="chosen">{t('campaign.outcome.chosen', { run: outcome.runId })}</p>
    case 'eliminated':
      return <p className="rlc-outcome" data-outcome="eliminated">{t('campaign.outcome.eliminated', { run: outcome.runId, reason: outcome.reason })}</p>
    case 'candidate': {
      const candidate = outcome.candidate
      return (
        <p className="rlc-outcome" data-outcome="candidate">
          {t('campaign.outcome.candidate', {
            run: candidate.runId,
            rank: candidate.rank === undefined ? '—' : String(candidate.rank),
            mean: candidate.verifiedMean === undefined ? '—' : String(candidate.verifiedMean),
            sd: candidate.verifiedSd === undefined ? '—' : String(candidate.verifiedSd),
          })}
        </p>
      )
    }
  }
}

function issueLine(issue: LoopReportIssue): string {
  const location = issue.line === undefined ? '' : `L${issue.line} `
  const token = issue.token ?? ''
  const text = issue.text ?? ''
  return `${location}${token}${token !== '' && text !== '' ? ' — ' : ''}${text}`.trim()
}

function CandidatesTable({ candidates, ownRunIds, t }: {
  readonly candidates: readonly LoopCandidate[]
  readonly ownRunIds?: readonly string[] | undefined
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  if (candidates.length === 0) return null
  const own = new Set(ownRunIds ?? [])
  return (
    <div className="rlc-candidates">
      <span className="rlc-label">{t('campaign.detail.candidates')}</span>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{t('campaign.candidates.run')}</th>
            <th>{t('campaign.candidates.mean')}</th>
            <th>{t('campaign.candidates.sd')}</th>
            <th>{t('campaign.candidates.seeds')}</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map(candidate => (
            <tr key={candidate.runId} data-own={own.has(candidate.runId) ? 'true' : undefined}>
              <td>{candidate.rank ?? ''}</td>
              <td><code>{candidate.runId}</code></td>
              <td>{candidate.verifiedMean ?? ''}</td>
              <td>{candidate.verifiedSd ?? ''}</td>
              <td>{candidate.seeds ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Round-level facts attached to the stage that produced them; `ownRunIds` marks one experiment's decision candidates. */
export function RoundExtras({ stageId, round, openFile, t, ownRunIds }: {
  readonly stageId: StageId
  readonly round: LoopRound
  readonly openFile: OpenFile
  readonly t: ResearchTranslate
  readonly ownRunIds?: readonly string[] | undefined
}): React.JSX.Element | null {
  if (stageId === 'scout' && round.scout !== undefined) {
    const scout = round.scout
    return (
      <div className="rlc-extra">
        <p>{scout.summary}</p>
        <Kvs t={t} entries={[
          ['campaign.detail.profile', [
            scout.taskType,
            scout.metric,
            scout.rowsTrain !== undefined && scout.columns !== undefined ? `${scout.rowsTrain}×${scout.columns}` : undefined,
            scout.baselinePresent === undefined ? undefined : scout.baselinePresent ? t('campaign.summary.baseline') : t('campaign.summary.noBaseline'),
          ].filter((part): part is string => part !== undefined && part !== '').join(' · ')],
          ['campaign.detail.cv', [
            scout.cv?.strategy,
            scout.cv?.groupColumn === undefined ? undefined : `group=${scout.cv.groupColumn}`,
            scout.cv?.timeColumn === undefined ? undefined : `time=${scout.cv.timeColumn}`,
            scout.cv?.reason,
          ].filter((part): part is string => part !== undefined && part !== '').join(' · ')],
        ]} />
        {scout.risks.length === 0 ? null : (
          <div className="rlc-risks-block">
            <span className="rlc-label">{t('campaign.detail.risks')}</span>
            <ul className="rlc-risks">
              {scout.risks.map(risk => <li key={risk}>{risk}</li>)}
            </ul>
          </div>
        )}
        {scout.evidence.length === 0 ? null : (
          <div className="rlc-evidence">
            <span className="rlc-label">{t('campaign.detail.evidence')}</span>
            <ul>
              {scout.evidence.map((card, index) => (
                <li key={`${index}:${card.claim ?? card.url ?? ''}`}>
                  {card.url === undefined ? null : <code>{card.url}</code>}
                  {card.claim === undefined ? null : <span>{card.claim}</span>}
                  {card.quote === undefined ? null : <span className="rlc-muted">{`“${card.quote}”`}</span>}
                  {card.support === undefined ? null : <span className="rlc-tag">{card.support}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }
  if (stageId === 'hypotheses' && round.hypotheses !== undefined) {
    return (
      <ul className="rlc-hypotheses">
        {round.hypotheses.map((hypothesis, index) => (
          <li key={hypothesis.hypothesisId ?? String(index)} className="rlc-hypothesis">
            <div className="rlc-hypothesis-head">
              {hypothesis.hypothesisId === undefined ? null : <code>{hypothesis.hypothesisId}</code>}
              <strong>{hypothesis.statement}</strong>
            </div>
            <Kvs t={t} entries={[
              ['campaign.detail.prediction', hypothesis.prediction],
              ['campaign.detail.rationale', hypothesis.rationale],
              ['campaign.detail.operator', hypothesis.operator],
              ['campaign.detail.family', hypothesis.family],
              ['campaign.detail.design', hypothesis.design],
              ['campaign.detail.expectedDelta', hypothesis.expectedDelta === undefined ? undefined : String(hypothesis.expectedDelta)],
              ['campaign.detail.cost', hypothesis.cost],
              ['campaign.detail.leakage', hypothesis.leakageRisk],
              ['campaign.detail.seeds', hypothesis.seeds === undefined ? undefined : hypothesis.seeds.join(', ')],
              ['campaign.detail.cvDesign', hypothesis.cvDesign],
            ]} />
          </li>
        ))}
      </ul>
    )
  }
  if (stageId === 'statistician') {
    const l3 = round.l3
    const design = round.design
    if (l3 === undefined && design === undefined) return null
    return (
      <div className="rlc-extra">
        {l3?.roundSummary === undefined ? null : <p>{l3.roundSummary}</p>}
        {l3 === undefined ? null : (
          <Kvs t={t} entries={[
            ['campaign.detail.roundDesign', [l3.seedVariance, l3.multipleComparisons, l3.budgetFairness].filter(Boolean).join(' · ')],
            ['campaign.detail.notes', l3.notes],
          ]} />
        )}
        {design === undefined ? null : (
          <Kvs t={t} entries={[
            ['campaign.detail.roundDesign', [
              design.best === undefined ? undefined : t('campaign.summary.statistician.best', {
                run: design.best.runId,
                value: String(design.best.value ?? '—'),
                delta: design.delta === undefined ? '' : ` (Δ ${design.delta})`,
              }),
              design.baselineRunId === undefined ? undefined : `baseline ${design.baselineRunId}`,
              design.verifiedRuns.length === 0 ? undefined : `${t('campaign.detail.verifiedRuns')}: ${design.verifiedRuns.length}`,
            ].filter(Boolean).join(' · ')],
          ]} />
        )}
      </div>
    )
  }
  if (stageId === 'decide' && round.decision !== undefined) {
    const decision = round.decision
    return (
      <div className="rlc-extra">
        {decision.chosenRunId === undefined
          ? null
          : <p>{t('campaign.decision.chosen', { run: decision.chosenRunId })}</p>}
        {decision.rationaleCode === undefined ? null : <p className="rlc-muted">{decision.rationaleCode}</p>}
        <CandidatesTable candidates={decision.candidates} ownRunIds={ownRunIds} t={t} />
        {decision.eliminated.length === 0 ? null : (
          <div>
            <span className="rlc-label">{t('campaign.detail.eliminated')}</span>
            <ul className="rlc-risks">
              {decision.eliminated.map(entry => (
                <li key={`${entry.runId}:${entry.reason}`}>{`${entry.runId} — ${entry.reason}`}</li>
              ))}
            </ul>
          </div>
        )}
        {decision.budgetUsed === undefined ? null : (
          <p className="rlc-muted">
            {t('campaign.detail.budget')}
            {': '}
            {Object.entries(decision.budgetUsed).map(([key, value]) => `${key}=${String(value)}`).join(' · ')}
          </p>
        )}
      </div>
    )
  }
  if (stageId === 'report' && round.report !== undefined) {
    const report = round.report
    return (
      <div className="rlc-extra">
        {report.path === undefined
          ? null
          : (
            <p>
              <button type="button" onClick={() => { openFile(report.path ?? '') }}>
                {t('campaign.report.path', { path: report.path })}
              </button>
            </p>
          )}
        <p className="rlc-muted">
          {report.ok === undefined ? null : t(report.ok ? 'campaign.detail.reportOk' : 'campaign.detail.reportFailed')}
          {report.strict === undefined ? null : ` · ${t('campaign.detail.strict')}: ${report.strict ? 'on' : 'off'}`}
        </p>
        {report.issues.length === 0 ? null : (
          <div>
            <span className="rlc-label">{t('campaign.detail.issues')}</span>
            <ul className="rlc-issues">
              {report.issues.map((issue, index) => <li key={`${index}:${issue.token ?? issue.text ?? ''}`}>{issueLine(issue)}</li>)}
            </ul>
          </div>
        )}
      </div>
    )
  }
  return null
}
