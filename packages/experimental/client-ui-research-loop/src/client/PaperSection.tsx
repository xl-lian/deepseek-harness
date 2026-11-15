/**
 * Paper-writing surfaces: the notebook section of one `paper-writing` run (stage
 * rail, file links, sections, figures and tables, audit passes, open issues,
 * review, and the PDF build), its dock strip, and its Chat card.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PAPER_STAGES } from '../shared/constants.ts'
import { PAPER_PATHS, paperItemPath, paperSectionPath } from '../shared/paper-labels.ts'
import type { PaperMember, PaperRun, ResearchView } from '../shared/schema.ts'
import type {} from './definition.ts'
import { currentPaper, elapsed, formatDuration, paperStageStatus } from './model.ts'
import { FileLink, Rail, RunNotes, StatusMark, StepChip, type OpenChild, type OpenPath, type ResearchTranslate } from './parts.tsx'

const RECOMMENDATIONS = ['accept', 'minor-revision', 'major-revision'] as const

function PaperRail({ run, t, compact = false }: {
  readonly run: PaperRun
  readonly t: ResearchTranslate
  readonly compact?: boolean
}): React.JSX.Element {
  const steps = PAPER_STAGES.map(stage => ({ key: stage, label: t(`paper.stage.${stage}`), status: paperStageStatus(run, stage) }))
  return <Rail steps={steps} t={t} compact={compact} />
}

function compileText(run: PaperRun, t: ResearchTranslate): string | undefined {
  const { compile } = run
  if (compile === undefined) return undefined
  if (compile.status === 'ok') return compile.pages === undefined ? t('paper.compile.built') : t('paper.compile.ok', { pages: compile.pages })
  return t(`paper.compile.${compile.status}`, { detail: compile.detail ?? '' })
}

function memberLabel(member: PaperMember, t: ResearchTranslate): string {
  return [t(`paper.member.${member.kind}`), member.target, member.pass].filter(part => part !== undefined).join(' ')
}

function recommendationText(value: string, t: ResearchTranslate): string {
  const known = RECOMMENDATIONS.find(candidate => candidate === value)
  return known === undefined ? value : t(`paper.recommendation.${known}`)
}

/** One paper-writing run in the notebook. */
export function PaperRunSection({ run, index, openPath, openChild, t }: {
  readonly run: PaperRun
  readonly index: number
  readonly openPath: OpenPath
  readonly openChild: OpenChild
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const time = elapsed(run.startedAt, run.endedAt, Date.now())
  const lastAudit = run.audits[run.audits.length - 1]
  const built = compileText(run, t)
  const files = [
    ...(run.compile?.status === 'ok' ? [['paper.file.pdf', run.compile.pdf ?? PAPER_PATHS.pdf] as const] : []),
    ['paper.file.main', PAPER_PATHS.main],
    ['paper.file.outline', PAPER_PATHS.outline],
    ['paper.file.bibliography', PAPER_PATHS.bibliography],
    ...(run.audits.length > 0 ? [['paper.file.audit', PAPER_PATHS.audit] as const] : []),
    ...(run.review === undefined ? [] : [['paper.file.review', PAPER_PATHS.review] as const]),
  ] as const
  return (
    <section className="rl-run rl-paper" data-status={run.status}>
      <header className="rl-run-head">
        <StatusMark status={run.status} t={t} />
        <h3 className="rl-run-title">{t('paper.run', { index: index + 1 })}</h3>
        <span className="rl-muted">{t(`status.${run.status}`)}</span>
        {time === undefined ? null : <span className="rl-elapsed">{t('run.elapsed', { time: formatDuration(time) })}</span>}
        <PaperRail run={run} t={t} />
      </header>
      <p className="rl-paper-title">{run.title ?? t('paper.untitled')}</p>
      <nav className="rl-notebook-links">
        {files.map(([key, path]) => <FileLink key={key} path={path} label={t(key)} openPath={openPath} />)}
      </nav>
      {built === undefined ? null : <p className="rl-notice" data-tone={run.compile?.status === 'failed' ? 'error' : undefined}>{built}</p>}
      <div className="rl-paper-grid">
        {run.sections.length === 0
          ? null
          : (
            <section>
              <h4 className="rl-section-title">{t('paper.sections')}</h4>
              <ul className="rl-list">
                {run.sections.map(section => (
                  <li key={section.id} className="rl-paper-row">
                    <FileLink path={paperSectionPath(section.id)} label={section.id} openPath={openPath} />
                    <span className="rl-muted">
                      {section.status === 'failed' || section.words === undefined ? t(`paper.section.${section.status}`) : t('paper.words', { count: section.words })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        {run.items.length === 0 && run.references === undefined
          ? null
          : (
            <section>
              <h4 className="rl-section-title">{t('paper.items')}</h4>
              <ul className="rl-list">
                {run.items.map(item => (
                  <li key={item.id} className="rl-paper-row">
                    {item.status === 'ready'
                      ? <FileLink path={paperItemPath(item.kind, item.id)} label={item.id} openPath={openPath} />
                      : <code className="rl-exp-id">{item.id}</code>}
                    <span className="rl-tag">{t(`paper.kind.${item.kind}`)}</span>
                    <span className="rl-muted" title={item.reason}>{t(`paper.item.${item.status}`)}{item.status === 'ready' || item.reason === undefined ? '' : ` — ${item.reason}`}</span>
                  </li>
                ))}
              </ul>
              {run.references === undefined ? null : <p className="rl-muted">{t('paper.references', { entries: run.references.entries })}</p>}
              {run.references === undefined || run.references.missing.length === 0
                ? null
                : <p className="rl-muted">{t('paper.referencesMissing', { ids: run.references.missing.join(', ') })}</p>}
            </section>
          )}
      </div>
      {run.audits.length === 0
        ? null
        : (
          <section>
            <h4 className="rl-section-title">{t('paper.audit')}</h4>
            <ul className="rl-list">
              {run.audits.map(audit => (
                <li key={audit.pass} data-blocking={audit.blocking > 0}>
                  {t('paper.auditPass', { pass: audit.pass, blocking: audit.blocking, minor: audit.minor })}
                </li>
              ))}
            </ul>
            {lastAudit?.numbers === undefined || lastAudit.citations === undefined
              ? null
              : <p className="rl-muted">{t('paper.auditChecked', { numbers: lastAudit.numbers, citations: lastAudit.citations })}</p>}
            {run.revisions === 0 ? null : <p className="rl-muted">{t('paper.revisions', { count: run.revisions })}</p>}
          </section>
        )}
      {run.status === 'running' || run.audits.length === 0
        ? null
        : (
          <section>
            <h4 className="rl-section-title">{t('paper.open')}</h4>
            {run.open.length === 0
              ? <p className="rl-muted">{t('paper.noOpen')}</p>
              : (
                <ul className="rl-list">
                  {run.open.map(issue => (
                    <li key={issue.id} className="rl-notice" data-tone={issue.blocking ? 'error' : undefined}>
                      <span className="rl-tag">{issue.blocking ? t('paper.blocking') : t('paper.minor')}</span>
                      {' '}<code className="rl-exp-id">{issue.section}</code>{' '}{issue.summary}
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}
      {run.review === undefined
        ? null
        : (
          <section>
            <h4 className="rl-section-title">{t('paper.review')}</h4>
            <p className="rl-paper-review">
              <span className="rl-tag">{recommendationText(run.review.recommendation, t)}</span>
              {run.review.summary === undefined ? null : ` ${run.review.summary}`}
            </p>
          </section>
        )}
      {run.stop === undefined || run.stop.reason === 'finished'
        ? null
        : <p className="rl-notice" data-tone="error">{t('paper.stopped', { reason: run.stop.detail ?? run.stop.reason })}</p>}
      {run.members.length === 0
        ? null
        : (
          <details className="rl-run-notes">
            <summary>{t('paper.steps')}</summary>
            <div className="rl-chips rl-paper-steps">
              {run.members.map(member => (
                <StepChip
                  key={member.seq}
                  status={member.status}
                  label={memberLabel(member, t)}
                  childId={member.childId}
                  t={t}
                  openChild={openChild}
                />
              ))}
            </div>
          </details>
        )}
      <RunNotes notes={run.notes} title={t('paper.notes')} />
    </section>
  )
}

/** Render the live paper strip from a view, or nothing when no paper run is running. */
export function PaperDockStrip({ view, openNotebook, t }: {
  readonly view: ResearchView | undefined
  readonly openNotebook: () => void
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const run = currentPaper(view)
  if (run?.status !== 'running') return null
  const time = elapsed(run.startedAt, run.endedAt, Date.now())
  return (
    <button type="button" className="rl-dock" onClick={openNotebook}>
      <StatusMark status={run.status} t={t} />
      <span className="rl-dock-title">{t('paper.title')}</span>
      <PaperRail run={run} t={t} compact />
      {run.phase === undefined ? null : <span className="rl-dock-round">{run.phase}</span>}
      {time === undefined ? null : <span className="rl-elapsed">{formatDuration(time)}</span>}
      <span className="rl-dock-open">{t('dock.open')}</span>
    </button>
  )
}

/** Render one paper run's compact card. */
export function PaperCardBody({ view, runId, openNotebook, t }: {
  readonly view: ResearchView | undefined
  readonly runId: string
  readonly openNotebook: () => void
  readonly t: ResearchTranslate
}): React.JSX.Element | null {
  const run = view?.papers.find(candidate => candidate.runId === runId)
  if (run === undefined) return null
  const lastAudit = run.audits[run.audits.length - 1]
  const built = compileText(run, t)
  return (
    <article className="rl-card" data-status={run.status}>
      <header className="rl-card-head">
        <StatusMark status={run.status} t={t} />
        <span className="rl-card-title">{t('paper.title')}</span>
        <span className="rl-muted">{t(`status.${run.status}`)}</span>
        <button type="button" className="rl-link rl-card-open" onClick={openNotebook}>{t('card.open')}</button>
      </header>
      <div className="rl-card-round">
        <PaperRail run={run} t={t} compact />
        <span className="rl-card-round-title">{run.title ?? t('paper.untitled')}</span>
      </div>
      {lastAudit === undefined
        ? null
        : <p className="rl-muted">{t('paper.auditPass', { pass: lastAudit.pass, blocking: lastAudit.blocking, minor: lastAudit.minor })}</p>}
      {built === undefined ? null : <p className="rl-muted">{built}</p>}
    </article>
  )
}

/** Actions injected for the paper Chat card. */
export interface PaperCardInjected {
  /** Open the notebook in the right Sidebar. */
  readonly openNotebook: () => void
}

/** Complete keyed Chat renderer props for the paper card. */
export type PaperCardProps =
  & PropsRuntime<'conversation.chat.node', 'research-paper'>
  & PropsLocale<'researchLoop'>
  & PaperCardInjected

/** Chat node slot occupant: reads the projection and renders {@link PaperCardBody} for its run. */
export function PaperCard({ node, useProjection, openNotebook, t }: PaperCardProps): React.JSX.Element | null {
  return <PaperCardBody view={useProjection('scienceResearchLoop')} runId={node.data.runId} openNotebook={openNotebook} t={t} />
}
