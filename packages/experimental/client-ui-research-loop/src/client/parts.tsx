/**
 * Rendering parts shared by the research notebook view, the dock, and the Chat
 * card: status marks, verdict badges, the stage rail, and one round's reading,
 * plan, experiments, and next-step sections.
 */

import { Fragment, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { notebookPaths } from '../shared/labels.ts'
import { RESEARCH_PRESET, RESEARCH_STAGES } from '../shared/constants.ts'
import type { LedgerRound, ResearchLedger, ResearchMember, ResearchRound, ResearchStatus, ResearchVerdict } from '../shared/schema.ts'
import type {} from './locales.ts'
import { experimentRows, focusRows, stageStatus, type ExperimentRow } from './model.ts'

/** Bound translator of the research loop namespace. */
export type ResearchTranslate = TranslateNS<'researchLoop'>

/** Open a workspace-relative notebook file in the right Sidebar. */
export type OpenPath = (path: string) => void

/** Open a member's child Session. */
export type OpenChild = (childId: string) => void

/** A status dot with a text alternative. */
export function StatusMark({ status, t }: { readonly status: ResearchStatus; readonly t: ResearchTranslate }): React.JSX.Element {
  return <span className="rl-dot" data-status={status} role="img" aria-label={t(`status.${status}`)} />
}

/** Verdict badge: always a text label, colored by outcome. */
export function VerdictBadge({ verdict, confidence, t }: {
  readonly verdict: ResearchVerdict
  readonly confidence?: string | undefined
  readonly t: ResearchTranslate
}): React.JSX.Element {
  return (
    <span className="rl-verdict" data-verdict={verdict}>
      {t(`verdict.${verdict}`)}
      {confidence === undefined ? null : <span className="rl-verdict-confidence">{t('confidence', { level: confidence })}</span>}
    </span>
  )
}

/** A link-styled button that opens a notebook file. */
export function FileLink({ path, label, openPath }: {
  readonly path: string
  readonly label: string
  readonly openPath: OpenPath
}): React.JSX.Element {
  return (
    <button type="button" className="rl-link" title={path} onClick={() => { openPath(path) }}>
      {label}
    </button>
  )
}

/** The five round stages with live status. */
export function StageRail({ round, t, compact = false }: {
  readonly round: ResearchRound
  readonly t: ResearchTranslate
  readonly compact?: boolean
}): React.JSX.Element {
  return (
    <ol className="rl-rail" data-compact={compact}>
      {RESEARCH_STAGES.map((stage, index) => {
        const status = stageStatus(round, stage)
        return (
          <li key={stage} className="rl-rail-step" data-status={status}>
            <span className="rl-rail-index" aria-hidden="true">{index + 1}</span>
            <span className="rl-rail-label">{t(`stage.${stage}`)}</span>
            <span className="rl-sr">{t(`status.${status}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Study-level notebook shortcuts. */
export function NotebookBar({ workspace, ledger, openPath, t }: {
  readonly workspace: string | undefined
  readonly ledger: ResearchLedger | undefined
  readonly openPath: OpenPath
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const paths = notebookPaths()
  const entries = [
    ['notebook.question', paths.question],
    ['notebook.guidance', paths.guidance],
    ['notebook.state', paths.state],
    ['notebook.nextPlan', paths.nextPlan],
    ['notebook.report', paths.report],
  ] as const
  return (
    <section className="rl-notebook" aria-label={t('notebook.title')}>
      <div className="rl-notebook-head">
        <h2 className="rl-notebook-title">{t('notebook.title')}</h2>
        {workspace === undefined ? null : <code className="rl-path" title={t('notebook.workspace')}>{workspace}</code>}
      </div>
      {ledger?.question === undefined ? null : <p className="rl-question">{ledger.question}</p>}
      <nav className="rl-notebook-links">
        {entries.map(([key, path]) => <FileLink key={key} path={path} label={t(key)} openPath={openPath} />)}
      </nav>
      {ledger === undefined || ledger.sources === undefined
        ? null
        : <p className="rl-muted">{t('reading.literature', { sources: ledger.sources, citations: ledger.citations ?? 0 })}</p>}
    </section>
  )
}

function MemberChip({ member, t, openChild }: {
  readonly member: ResearchMember
  readonly t: ResearchTranslate
  readonly openChild: OpenChild
}): React.JSX.Element {
  const label = `${t(`kind.${member.kind}`)}${member.pass === undefined ? '' : ` ${member.pass}`}`
  if (member.childId === undefined) {
    return <span className="rl-chip" data-status={member.status}><StatusMark status={member.status} t={t} />{label}</span>
  }
  const childId = member.childId
  return (
    <button type="button" className="rl-chip" data-status={member.status} title={t('member.open')} onClick={() => { openChild(childId) }}>
      <StatusMark status={member.status} t={t} />{label}
    </button>
  )
}

function ReadingSection({ round, openPath, openChild, t }: {
  readonly round: ResearchRound
  readonly openPath: OpenPath
  readonly openChild: OpenChild
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const paths = notebookPaths(round.number)
  const focuses = focusRows(round)
  const searches = round.members.filter(member => member.kind === 'search' || member.kind === 'refine')
  const { retrieval } = round
  return (
    <section className="rl-section" data-stage="retrieve">
      <h4 className="rl-section-title">{t('reading.title')}</h4>
      {retrieval === undefined
        ? null
        : (
          <p className="rl-muted">
            {t('reading.summary', { focuses: retrieval.focuses, passes: retrieval.passes })}
            {' · '}
            {t(retrieval.enough ? 'reading.enough' : 'reading.notEnough')}
          </p>
        )}
      {focuses.length === 0 && retrieval !== undefined && retrieval.focuses === 0 ? <p className="rl-muted">{t('reading.none')}</p> : null}
      <ul className="rl-focus-list">
        {focuses.map(focus => (
          <li key={focus.id} className="rl-focus">
            <StatusMark status={focus.status} t={t} />
            {paths.retrievalDir === undefined
              ? <span>{t('reading.focus', { id: focus.id })}</span>
              : <FileLink path={`${paths.retrievalDir}/${focus.id}.md`} label={t('reading.focus', { id: focus.id })} openPath={openPath} />}
            {focus.childId === undefined
              ? null
              : <button type="button" className="rl-icon-link" title={t('member.open')} onClick={() => { if (focus.childId !== undefined) openChild(focus.childId) }}>↗</button>}
          </li>
        ))}
      </ul>
      <div className="rl-chips">
        {searches.map(member => <MemberChip key={member.seq} member={member} t={t} openChild={openChild} />)}
        {paths.coverage === undefined || retrieval === undefined ? null : <FileLink path={paths.coverage} label={t('reading.coverage')} openPath={openPath} />}
      </div>
    </section>
  )
}

function PlanSection({ round, ledger, openPath, t }: {
  readonly round: ResearchRound
  readonly ledger: LedgerRound | undefined
  readonly openPath: OpenPath
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const paths = notebookPaths(round.number)
  const registered = ledger?.registeredPlan
  const planned = round.plan
  let line: React.JSX.Element
  if (planned?.registered === false) line = <p className="rl-notice" data-tone="error">{t('plan.notRegistered', { error: planned.error ?? '' })}</p>
  else if (planned?.registered === true || registered !== undefined) {
    line = (
      <p className="rl-ok">
        <span className="rl-seal" aria-hidden="true">✓</span>
        {t('plan.registered')}
        {registered?.registeredAt === undefined ? null : <span className="rl-muted"> · {t('plan.registeredAt', { time: registered.registeredAt })}</span>}
      </p>
    )
  } else line = <p className="rl-muted">{t('plan.pending')}</p>
  return (
    <section className="rl-section" data-stage="plan">
      <h4 className="rl-section-title">{t('plan.title')}</h4>
      {line}
      {registered?.changedSince === true ? <p className="rl-notice" data-tone="warn">{t('plan.changed')}</p> : null}
      {paths.roundPlan === undefined || planned === undefined && registered === undefined
        ? null
        : <FileLink path={registered?.path ?? paths.roundPlan} label={t('plan.open')} openPath={openPath} />}
    </section>
  )
}

function EvidenceCell({ row, t }: { readonly row: ExperimentRow; readonly t: ResearchTranslate }): React.JSX.Element {
  const evidence = row.ledger?.evidenceClass
  if (evidence === undefined) {
    const role = row.loop.role
    return role === undefined
      ? <span className="rl-muted">—</span>
      : <span className="rl-role" data-role={role}>{t(`role.${role}`)}</span>
  }
  return <span className="rl-evidence" data-evidence={evidence}>{t(`evidence.${evidence}`)}</span>
}

function ExperimentRowView({ row, round, openPath, openChild, t }: {
  readonly row: ExperimentRow
  readonly round: ResearchRound
  readonly openPath: OpenPath
  readonly openChild: OpenChild
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const paths = notebookPaths(round.number)
  const { loop, ledger } = row
  const runs = ledger?.runs.length ? ledger.runs : loop.runIds ?? []
  const openObjections = ledger === undefined
    ? loop.unresolved ?? []
    : ledger.objections.filter(objection => objection.status === 'open').map(objection => objection.id)
  const objectionCount = ledger?.objections.length ?? openObjections.length
  return (
    <Fragment>
      <tr className="rl-exp" data-status={row.status} data-open={open}>
        <th scope="row">
          <button type="button" className="rl-exp-toggle" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
            <span className="rl-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
            <code className="rl-exp-id">{row.id}</code>
          </button>
          {loop.title === undefined ? null : <span className="rl-exp-title">{loop.title}</span>}
        </th>
        <td>
          <div className="rl-chips">
            {row.attempts.map(([kind, count]) => <span key={kind} className="rl-count">{t(`kind.${kind}`)} ×{count}</span>)}
            {loop.notRunByCap === true ? <span className="rl-muted">{t('experiments.notRun')}</span> : null}
          </div>
        </td>
        <td>
          {loop.verdict !== undefined
            ? <VerdictBadge verdict={loop.verdict} confidence={loop.confidence} t={t} />
            : loop.outcome !== undefined && loop.outcome !== 'ran'
              ? <span className="rl-outcome" data-outcome={loop.outcome}>{loop.outcome}</span>
              : <StatusMark status={row.status} t={t} />}
        </td>
        <td><EvidenceCell row={row} t={t} /></td>
        <td>
          {objectionCount === 0
            ? <span className="rl-muted">—</span>
            : openObjections.length > 0
              ? <span className="rl-objections" data-open="true">{t('objection.open', { ids: openObjections.join(', ') })}</span>
              : <span className="rl-objections">{t('objection.count', { count: objectionCount })}</span>}
        </td>
        <td className="rl-runs">
          {runs.slice(0, 4).map(runId => <FileLink key={runId} path={`runs/${runId}/logs/stdout.log`} label={runId} openPath={openPath} />)}
          {runs.length > 4 ? <span className="rl-muted">+{runs.length - 4}</span> : null}
        </td>
      </tr>
      {open
        ? (
          <tr className="rl-exp-detail">
            <td colSpan={6}>
              {loop.reason === undefined ? null : <p className="rl-muted">{loop.reason}</p>}
              {ledger?.demotedBy.length
                ? <div><span className="rl-kv-key">{t('experiments.demoted')}</span><ul className="rl-list">{ledger.demotedBy.map(reason => <li key={reason}>{reason}</li>)}</ul></div>
                : null}
              {ledger?.flags.length
                ? <div><span className="rl-kv-key">{t('experiments.flags')}</span><ul className="rl-list">{ledger.flags.map(flag => <li key={flag}>{flag}</li>)}</ul></div>
                : null}
              {ledger?.objections.length
                ? (
                  <ul className="rl-list">
                    {ledger.objections.map(objection => (
                      <li key={`${objection.id}-${objection.status}`}>
                        <code>{objection.id}</code> <span className="rl-objection-status" data-status={objection.status}>{objection.status}</span>
                        {objection.summary === undefined ? null : ` — ${objection.summary}`}
                      </li>
                    ))}
                  </ul>
                )
                : null}
              {ledger?.verdictBy === undefined ? null : <p className="rl-muted">{t('experiments.verdictBy', { label: ledger.verdictBy })}</p>}
              <div className="rl-chips">
                <span className="rl-kv-key">{t('experiments.members')}</span>
                {row.members.map(member => <MemberChip key={member.seq} member={member} t={t} openChild={openChild} />)}
                {paths.validationDir === undefined || loop.verdict === undefined
                  ? null
                  : <FileLink path={`${paths.validationDir}/${row.id}.md`} label={t('experiments.validation')} openPath={openPath} />}
              </div>
            </td>
          </tr>
        )
        : null}
    </Fragment>
  )
}

function ExperimentsSection({ round, ledger, openPath, openChild, t }: {
  readonly round: ResearchRound
  readonly ledger: LedgerRound | undefined
  readonly openPath: OpenPath
  readonly openChild: OpenChild
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const rows = experimentRows(round, ledger)
  return (
    <section className="rl-section" data-stage="experiment">
      <h4 className="rl-section-title">{t('experiments.title')}</h4>
      {rows.length === 0
        ? <p className="rl-muted">{t('experiments.none')}</p>
        : (
          <div className="rl-table-wrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th scope="col">{t('experiments.id')}</th>
                  <th scope="col">{t('experiments.attempts')}</th>
                  <th scope="col">{t('experiments.verdict')}</th>
                  <th scope="col">{t('experiments.evidence')}</th>
                  <th scope="col">{t('experiments.objections')}</th>
                  <th scope="col">{t('experiments.runs')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <ExperimentRowView key={row.id} row={row} round={round} openPath={openPath} openChild={openChild} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}

function NextSection({ round, t }: { readonly round: ResearchRound; readonly t: ResearchTranslate }): React.JSX.Element | null {
  if (round.decision === undefined && round.needsHuman === undefined) return null
  return (
    <section className="rl-section" data-stage="next">
      <h4 className="rl-section-title">{t('next.title')}</h4>
      {round.decision === undefined
        ? null
        : (
          <p>
            <span className="rl-decision" data-decision={round.decision}>{t(round.decision === 'continue' ? 'next.continue' : 'next.stop')}</span>
            {round.reason === undefined ? null : <span> — {round.reason}</span>}
          </p>
        )}
      {round.needsHuman === undefined ? null : <p className="rl-notice" data-tone="warn">{t('next.human', { text: round.needsHuman })}</p>}
    </section>
  )
}

/** One round's sections. */
export function RoundBody({ round, ledger, openPath, openChild, t }: {
  readonly round: ResearchRound
  readonly ledger: LedgerRound | undefined
  readonly openPath: OpenPath
  readonly openChild: OpenChild
  readonly t: ResearchTranslate
}): React.JSX.Element {
  return (
    <div className="rl-round-body">
      <ReadingSection round={round} openPath={openPath} openChild={openChild} t={t} />
      <PlanSection round={round} ledger={ledger} openPath={openPath} t={t} />
      <ExperimentsSection round={round} ledger={ledger} openPath={openPath} openChild={openChild} t={t} />
      <NextSection round={round} t={t} />
      {round.notes.length === 0
        ? null
        : <ul className="rl-notes">{round.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
    </div>
  )
}

/** Empty state: whether the Session runs the research preset and whether the skill is loaded. */
export function ResearchEmpty({ agentPreset, skillLoaded, t }: {
  readonly agentPreset: string | null | undefined
  readonly skillLoaded: boolean
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const message = agentPreset !== undefined && agentPreset !== null && agentPreset !== RESEARCH_PRESET
    ? t('empty.notResearch')
    : skillLoaded ? t('empty.skill') : t('empty.ready')
  return (
    <div className="rl-empty">
      <h3 className="rl-empty-title">{t('empty.title')}</h3>
      <p className="rl-muted">{message}</p>
    </div>
  )
}
