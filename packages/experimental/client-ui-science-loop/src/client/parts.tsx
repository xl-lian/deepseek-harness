/**
 * Shared rendering parts for the inline loop card, the large right-Sidebar
 * view, and the Loop architecture tab: stage summaries, stage detail sections,
 * member rows, and the round extras attached to each stage.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  type LoopCandidate,
  type LoopCheck,
  type LoopMember,
  type LoopReportIssue,
  type LoopRound,
  type LoopStage,
  type StageId,
} from '../shared/types.ts'
import type { ScienceLoopKey } from './locales.ts'

/** Locale-bound translator for this card's namespace. */
export type LoopTranslate = TranslateNS<'scienceLoop'>

/** Open a workspace-relative file in the right Sidebar. */
export type OpenFile = (path: string, options?: { readonly line?: number }) => void

/** Render a projection empty state that explains why no round is available. */
export function ScienceLoopEmpty({ agentPreset, scienceSkillLoaded = false, compact = false, t }: {
  readonly agentPreset: string | null | undefined
  readonly scienceSkillLoaded?: boolean | undefined
  readonly compact?: boolean
  readonly t: LoopTranslate
}): React.JSX.Element {
  const science = agentPreset === 'science'
  const title = science
    ? t('empty.science.title')
    : agentPreset === null || agentPreset === undefined
      ? t('empty.unknown.title')
      : t('empty.notScience.title')
  const body = science
    ? t(scienceSkillLoaded ? 'empty.science.skillLoadedBody' : 'empty.science.body')
    : agentPreset === null || agentPreset === undefined
      ? t('empty.unknown.body')
      : t('empty.notScience.body', { preset: agentPreset })
  return (
    <div className="sal-empty" data-compact={compact ? 'true' : undefined} data-state={science ? 'ready' : 'inactive'}>
      <h2 className="sal-empty-title">{title}</h2>
      <p className="sal-empty-body">{body}</p>
      {science
        ? (
          <p className="sal-empty-command">
            <span>{t('empty.science.commandHint')}</span>
            <code>/sa-round quick</code>
            <span aria-hidden="true">·</span>
            <code>/sa-campaign</code>
          </p>
        )
        : null}
    </div>
  )
}

/** Format a millisecond duration as m:ss. */
export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Translate a loop status. */
export function statusLabel(t: LoopTranslate, status: LoopRound['status']): string {
  return t(`status.${status}`)
}

/** Render 1–3 summary lines for a stage card. */
export function StageSummaryLines({ lines, className }: {
  readonly lines: readonly string[]
  readonly className?: string
}): React.JSX.Element | null {
  if (lines.length === 0) return null
  return (
    <span className={className === undefined ? 'sal-summary' : `sal-summary ${className}`}>
      {lines.map((line, index) => (
        <span key={`${index}:${line}`} className="sal-summary-line">{line}</span>
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

/** Stage details shared by the card and the large views. */
export function StageDetails({ stage, round, openFile, openSessionFor, t, summaryLines }: {
  readonly stage: LoopStage
  readonly round: LoopRound
  readonly openFile: OpenFile
  readonly openSessionFor: (childId: string) => void
  readonly t: LoopTranslate
  readonly summaryLines?: readonly string[]
}): React.JSX.Element {
  const extras = extrasAvailable(stage.id, round)
  return (
    <div className="sal-details">
      {summaryLines === undefined ? null : <StageSummaryLines lines={summaryLines} className="sal-details-summary" />}
      <RoundExtras stageId={stage.id} round={round} openFile={openFile} t={t} />
      {stage.members.length === 0
        ? (extras ? null : <p className="sal-empty">{isTerminal(round) ? t('stage.emptyIdle') : t('stage.emptyPending')}</p>)
        : (
          <ul className="sal-members">
            {stage.members.map(member => (
              <li key={member.id} className="sal-member" data-status={member.status}>
                <MemberRow member={member} openFile={openFile} openSessionFor={openSessionFor} t={t} />
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

function Kvs({ t, entries }: {
  readonly t: LoopTranslate
  readonly entries: readonly (readonly [ScienceLoopKey, string | undefined])[]
}): React.JSX.Element | null {
  const present = entries.filter((entry): entry is readonly [ScienceLoopKey, string] => entry[1] !== undefined && entry[1] !== '')
  if (present.length === 0) return null
  return (
    <dl className="sal-kv">
      {present.map(([key, value]) => (
        <div key={key} className="sal-kv-row">
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
export function MemberRow({ member, openFile, openSessionFor, t }: {
  readonly member: LoopMember
  readonly openFile: OpenFile
  readonly openSessionFor: (childId: string) => void
  readonly t: LoopTranslate
}): React.JSX.Element {
  const runIds = member.runIds ?? []
  const metrics = memberMetricsLine(member)
  // A sub-second span means the start and end were logged together, not a real duration.
  const elapsed = member.startedAt === undefined ? undefined : (member.endedAt ?? Date.now()) - member.startedAt
  return (
    <>
      <div className="sal-member-head">
        <span className="sal-dot" data-status={member.status} aria-hidden="true" />
        <span className="sal-member-label">{member.label}</span>
        {member.label.replaceAll('_', '-') === member.role
          ? null
          : <span className="sal-member-role">{member.role}</span>}
        <span className={member.status === 'completed' ? 'sal-sr' : 'sal-member-status'}>
          {t(`status.${member.status}`)}
        </span>
        {member.verdict === undefined
          ? null
          : <span className="sal-verdict" data-verdict={member.verdict}>{member.verdict}</span>}
        {member.repaired === true
          ? <span className="sal-tag">{t('detail.repaired')}</span>
          : null}
        {elapsed === undefined || elapsed < 1000
          ? null
          : <span className="sal-member-time">{formatDuration(elapsed)}</span>}
      </div>
      {member.statusDetail === undefined
        ? null
        : <p className="sal-muted sal-status-detail">{member.statusDetail}</p>}
      {member.plan === undefined
        ? null
        : (
          <div className="sal-plan">
            <span className="sal-label">{t('detail.plan')}</span>
            <p>{member.plan}</p>
          </div>
        )}
      {member.notes === undefined
        ? null
        : (
          <div className="sal-notes">
            <span className="sal-label">{t('detail.notes')}</span>
            <p>{member.notes}</p>
          </div>
        )}
      {metrics === undefined
        ? null
        : (
          <div className="sal-metrics">
            <span className="sal-label">{member.metricsVerified === undefined ? t('detail.metrics') : t('detail.verifiedMetrics')}</span>
            <code>{metrics}</code>
          </div>
        )}
      {member.trust === undefined && (member.blockingFailures?.length ?? 0) === 0 && (member.warnings?.length ?? 0) === 0
        ? null
        : (
          <div className="sal-flags">
            {member.trust === undefined ? null : (
              <span className="sal-flag" data-kind="trust">
                {t('detail.trust')}
                {' '}
                {member.trust}
              </span>
            )}
            {(member.blockingFailures ?? []).map(failure => (
              <span key={`b:${failure}`} className="sal-flag" data-kind="blocking">
                {t('detail.blocking')}
                {': '}
                {failure}
              </span>
            ))}
            {(member.warnings ?? []).map(warning => (
              <span key={`w:${warning}`} className="sal-flag" data-kind="warning">
                {t('detail.warnings')}
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
          <div className="sal-files">
            <span className="sal-label">{t('detail.files')}</span>
            {member.files?.map(file => (
              <button key={file} type="button" className="sal-file" onClick={() => { openFile(file) }}>
                {file}
              </button>
            ))}
          </div>
        )}
      {member.summary === undefined || member.summary === member.plan || member.summary === member.notes
        ? null
        : <p className="sal-member-summary">{member.summary}</p>}
      <div className="sal-member-actions">
        {member.childId === undefined
          ? null
          : (
            <button type="button" onClick={() => { openSessionFor(member.childId as string) }}>
              {t('member.openSession')}
            </button>
          )}
        {runIds.map(runId => (
          <button key={`${member.id}:${runId}:verdict`} type="button" onClick={() => { openFile(`runs/${runId}/verdict.json`) }}>
            {`${t('member.verdict')} ${runId}`}
          </button>
        ))}
        {runIds.map(runId => (
          <button key={`${member.id}:${runId}:logs`} type="button" onClick={() => { openFile(`runs/${runId}/logs/stdout.log`) }}>
            {`${t('member.logs')} ${runId}`}
          </button>
        ))}
      </div>
      {member.output === undefined
        ? null
        : (
          <details className="sal-output">
            <summary>{t('member.output')}</summary>
            <pre>{member.output}</pre>
          </details>
        )}
    </>
  )
}

function ChecksList({ checks, t }: {
  readonly checks: readonly LoopCheck[]
  readonly t: LoopTranslate
}): React.JSX.Element {
  const byLayer = new Map<string, LoopCheck[]>()
  for (const check of checks) {
    const list = byLayer.get(check.layer) ?? []
    list.push(check)
    byLayer.set(check.layer, list)
  }
  return (
    <details className="sal-checks">
      <summary>
        {t('detail.checks')}
        {' '}
        {`(${checks.length})`}
      </summary>
      {[...byLayer.entries()].map(([layer, list]) => (
        <div key={layer} className="sal-check-layer">
          <span className="sal-label">{layer === '' ? '—' : layer}</span>
          <ul>
            {list.map(check => (
              <li key={`${check.layer}:${check.checkId}`} className="sal-check" data-status={check.status}>
                <span className="sal-verdict" data-verdict={check.status === 'skip' ? undefined : check.status}>{check.status}</span>
                <code>{check.checkId}</code>
                {check.summary === undefined ? null : <span className="sal-muted">{check.summary}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}

function issueLine(issue: LoopReportIssue): string {
  const location = issue.line === undefined ? '' : `L${issue.line} `
  const token = issue.token ?? ''
  const text = issue.text ?? ''
  return `${location}${token}${token !== '' && text !== '' ? ' — ' : ''}${text}`.trim()
}

function CandidatesTable({ candidates, t }: {
  readonly candidates: readonly LoopCandidate[]
  readonly t: LoopTranslate
}): React.JSX.Element | null {
  if (candidates.length === 0) return null
  return (
    <div className="sal-candidates">
      <span className="sal-label">{t('detail.candidates')}</span>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>run</th>
            <th>mean</th>
            <th>sd</th>
            <th>seeds</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map(candidate => (
            <tr key={candidate.runId}>
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

/** Round-level facts attached to the stage that produced them. */
export function RoundExtras({ stageId, round, openFile, t }: {
  readonly stageId: StageId
  readonly round: LoopRound
  readonly openFile: OpenFile
  readonly t: LoopTranslate
}): React.JSX.Element | null {
  if (stageId === 'scout' && round.scout !== undefined) {
    const scout = round.scout
    return (
      <div className="sal-extra">
        <p>{scout.summary}</p>
        <Kvs t={t} entries={[
          ['detail.profile', [
            scout.taskType,
            scout.metric,
            scout.rowsTrain !== undefined && scout.columns !== undefined ? `${scout.rowsTrain}×${scout.columns}` : undefined,
            scout.baselinePresent === undefined ? undefined : scout.baselinePresent ? t('summary.baseline') : t('summary.noBaseline'),
          ].filter((part): part is string => part !== undefined && part !== '').join(' · ')],
          ['detail.cv', [
            scout.cv?.strategy,
            scout.cv?.groupColumn === undefined ? undefined : `group=${scout.cv.groupColumn}`,
            scout.cv?.timeColumn === undefined ? undefined : `time=${scout.cv.timeColumn}`,
            scout.cv?.reason,
          ].filter((part): part is string => part !== undefined && part !== '').join(' · ')],
        ]} />
        {scout.risks.length === 0 ? null : (
          <div className="sal-risks-block">
            <span className="sal-label">{t('detail.risks')}</span>
            <ul className="sal-risks">
              {scout.risks.map(risk => <li key={risk}>{risk}</li>)}
            </ul>
          </div>
        )}
        {scout.evidence.length === 0 ? null : (
          <div className="sal-evidence">
            <span className="sal-label">{t('detail.evidence')}</span>
            <ul>
              {scout.evidence.map((card, index) => (
                <li key={`${index}:${card.claim ?? card.url ?? ''}`}>
                  {card.url === undefined ? null : <code>{card.url}</code>}
                  {card.claim === undefined ? null : <span>{card.claim}</span>}
                  {card.quote === undefined ? null : <span className="sal-muted">{`“${card.quote}”`}</span>}
                  {card.support === undefined ? null : <span className="sal-tag">{card.support}</span>}
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
      <ul className="sal-hypotheses">
        {round.hypotheses.map((hypothesis, index) => (
          <li key={hypothesis.hypothesisId ?? String(index)} className="sal-hypothesis">
            <div className="sal-hypothesis-head">
              {hypothesis.hypothesisId === undefined ? null : <code>{hypothesis.hypothesisId}</code>}
              <strong>{hypothesis.statement}</strong>
            </div>
            <Kvs t={t} entries={[
              ['detail.prediction', hypothesis.prediction],
              ['detail.rationale', hypothesis.rationale],
              ['detail.design', hypothesis.design],
              ['detail.expectedDelta', hypothesis.expectedDelta === undefined ? undefined : String(hypothesis.expectedDelta)],
              ['detail.cost', hypothesis.cost],
              ['detail.leakage', hypothesis.leakageRisk],
              ['detail.seeds', hypothesis.seeds === undefined ? undefined : hypothesis.seeds.join(', ')],
              ['detail.cvDesign', hypothesis.cvDesign],
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
      <div className="sal-extra">
        {l3?.roundSummary === undefined ? null : <p>{l3.roundSummary}</p>}
        {l3 === undefined ? null : (
          <Kvs t={t} entries={[
            ['detail.roundDesign', [l3.seedVariance, l3.multipleComparisons, l3.budgetFairness].filter(Boolean).join(' · ')],
            ['detail.notes', l3.notes],
          ]} />
        )}
        {design === undefined ? null : (
          <Kvs t={t} entries={[
            ['detail.roundDesign', [
              design.best === undefined ? undefined : t('summary.statistician.best', {
                run: design.best.runId,
                value: String(design.best.value ?? '—'),
                delta: design.delta === undefined ? '' : ` (Δ ${design.delta})`,
              }),
              design.baselineRunId === undefined ? undefined : `baseline ${design.baselineRunId}`,
              design.verifiedRuns.length === 0 ? undefined : `${t('detail.verifiedRuns')}: ${design.verifiedRuns.length}`,
            ].filter(Boolean).join(' · ')],
          ]} />
        )}
      </div>
    )
  }
  if (stageId === 'decide' && round.decision !== undefined) {
    const decision = round.decision
    return (
      <div className="sal-extra">
        {decision.chosenRunId === undefined
          ? null
          : <p>{t('decision.chosen', { run: decision.chosenRunId })}</p>}
        {decision.rationaleCode === undefined ? null : <p className="sal-muted">{decision.rationaleCode}</p>}
        <CandidatesTable candidates={decision.candidates} t={t} />
        {decision.eliminated.length === 0 ? null : (
          <div>
            <span className="sal-label">{t('detail.eliminated')}</span>
            <ul className="sal-risks">
              {decision.eliminated.map(entry => (
                <li key={`${entry.runId}:${entry.reason}`}>{`${entry.runId} — ${entry.reason}`}</li>
              ))}
            </ul>
          </div>
        )}
        {decision.budgetUsed === undefined ? null : (
          <p className="sal-muted">
            {t('detail.budget')}
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
      <div className="sal-extra">
        {report.path === undefined
          ? null
          : (
            <p>
              <button type="button" onClick={() => { openFile(report.path ?? '') }}>
                {t('report.path', { path: report.path })}
              </button>
            </p>
          )}
        <p className="sal-muted">
          {report.ok === undefined ? null : t(report.ok ? 'detail.reportOk' : 'detail.reportFailed')}
          {report.strict === undefined ? null : ` · ${t('detail.strict')}: ${report.strict ? 'on' : 'off'}`}
        </p>
        {report.issues.length === 0 ? null : (
          <div>
            <span className="sal-label">{t('detail.issues')}</span>
            <ul className="sal-issues">
              {report.issues.map((issue, index) => <li key={`${index}:${issue.token ?? issue.text ?? ''}`}>{issueLine(issue)}</li>)}
            </ul>
          </div>
        )}
      </div>
    )
  }
  return null
}
