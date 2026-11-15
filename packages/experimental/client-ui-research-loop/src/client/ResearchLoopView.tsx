/**
 * Notebook view tab beside Chat: study-level notebook shortcuts, then every
 * `research-loop` run of the Session with its rounds, oldest first. Each round
 * shows its stage rail, reading, pre-registered plan, experiments, and next
 * step, joined with the latest research status ledger.
 */

import type { ConversationViewDefinition, ConversationViewNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { notebookPaths } from '../shared/labels.ts'
import type { ResearchRun, ResearchView } from '../shared/schema.ts'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import { elapsed, formatDuration, ledgerRound, stopText } from './model.ts'
import { PaperRunSection } from './PaperSection.tsx'
import { FileLink, NotebookBar, RunNotes, ResearchEmpty, RoundBody, StageRail, StatusMark, type ResearchTranslate } from './parts.tsx'

/** Empty snapshot for the target; the view reads the projection directly. */
const EMPTY_SNAPSHOT = { v: 1 } as const

/** Target registration so the shell can select the notebook tab. */
export const researchLoopViewDefinition: ConversationViewDefinition<ConversationViewNode, { readonly v: 1 }> = {
  target: 'research-loop',
  create: () => ({ empty: EMPTY_SNAPSHOT, replace: () => EMPTY_SNAPSHOT, apply: () => EMPTY_SNAPSHOT }),
}

/** Navigation actions injected from the plugin's client services. */
export interface ResearchNavigation {
  /** Open one member's child Session of `parentSessionId`. */
  readonly openChild: (parentSessionId: SessionId, childId: string) => void
  /** Open a file of `sessionId` by absolute or workspace-relative path in the right Sidebar. */
  readonly openFile: (sessionId: SessionId, path: string) => void
}

/** Injected props of the notebook view tab: navigation plus opening the right-Sidebar notebook tab. */
export type ResearchLoopViewInjected = ResearchNavigation & {
  /** Open the notebook tab in the right Sidebar. */
  readonly openNotebook: () => void
}

/** Composed props of the notebook view tab. */
export type ResearchLoopViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsLocale<'researchLoop'>
  & ResearchLoopViewInjected

/** The Chat view's id, selected when the notebook moves beside it. */
const CHAT_VIEW = 'chat'

/** One loop run: header, rounds, write-up. */
export function RunSection({ run, index, view, sessionId, openChild, openFile, t }: ResearchNavigation & {
  readonly run: ResearchRun
  readonly index: number
  readonly view: ResearchView
  readonly sessionId: SessionId
  readonly t: ResearchTranslate
}): React.JSX.Element {
  const openPath = (path: string): void => { openFile(sessionId, resolveWorkspacePath(run.workspace, path)) }
  const openRunChild = (childId: string): void => { openChild(sessionId, childId) }
  const time = elapsed(run.startedAt, run.endedAt, Date.now())
  const stopped = stopText(run)
  return (
    <section className="rl-run" data-status={run.status}>
      <header className="rl-run-head">
        <StatusMark status={run.status} t={t} />
        <h3 className="rl-run-title">{t('run.title', { index: index + 1 })}</h3>
        <span className="rl-muted">{t(`status.${run.status}`)}</span>
        {run.status === 'running' && run.phase !== undefined ? <span className="rl-phase">{t('run.phase', { phase: run.phase })}</span> : null}
        {time === undefined ? null : <span className="rl-elapsed">{t('run.elapsed', { time: formatDuration(time) })}</span>}
      </header>
      {run.rounds.map(round => (
        <article key={round.number} className="rl-round" data-status={round.status}>
          <header className="rl-round-head">
            <h4 className="rl-round-title">{t('round.title', { number: round.number })}</h4>
            {round.roundId === undefined ? null : <code className="rl-round-id">{round.roundId}</code>}
            {round.reused === true ? <span className="rl-tag">{t('round.resumed')}</span> : null}
            <StageRail round={round} t={t} />
          </header>
          <RoundBody round={round} ledger={ledgerRound(view, round)} openPath={openPath} openChild={openRunChild} t={t} />
        </article>
      ))}
      {stopped === undefined ? null : <p className="rl-muted">{t('run.stopped', { reason: stopped })}</p>}
      {run.answer === undefined && run.writeUp === undefined
        ? null
        : (
          <section className="rl-writeup">
            <h4 className="rl-section-title">
              {run.writeUp === undefined ? null : <StatusMark status={run.writeUp.status} t={t} />}
              {t('writeUp.title')}
            </h4>
            {run.answer === undefined ? null : <blockquote className="rl-answer">{run.answer}</blockquote>}
            <FileLink path={notebookPaths().report} label={t('writeUp.open')} openPath={openPath} />
          </section>
        )}
      <RunNotes notes={run.notes} title={t('run.notes')} />
    </section>
  )
}

/** Props of the notebook body. */
export type NotebookContentProps = ResearchNavigation & {
  /** Projection view, or `undefined` before the first snapshot. */
  readonly view: ResearchView | undefined
  readonly sessionId: SessionId
  readonly t: ResearchTranslate
  /** Move the notebook beside Chat; omitted where it already sits beside Chat. */
  readonly openBeside?: (() => void) | undefined
}

/** The notebook body shared by the view tab and the right-Sidebar tab. */
export function NotebookContent({ view, sessionId, openChild, openFile, openBeside, t }: NotebookContentProps): React.JSX.Element {
  const runs = view?.runs ?? []
  const papers = view?.papers ?? []
  const workspace = runs[runs.length - 1]?.workspace ?? view?.ledger?.workspace ?? papers[papers.length - 1]?.workspace
  return (
    <div className="rl-view">
      <NotebookBar
        workspace={workspace}
        ledger={view?.ledger}
        openPath={(path) => { openFile(sessionId, resolveWorkspacePath(workspace, path)) }}
        openBeside={openBeside}
        t={t}
      />
      {view === undefined || (runs.length === 0 && papers.length === 0)
        ? <ResearchEmpty agentPreset={view?.agentPreset} skillLoaded={view?.skillLoaded ?? false} t={t} />
        : runs.map((run, index) => (
          <RunSection
            key={run.runId}
            run={run}
            index={index}
            view={view}
            sessionId={sessionId}
            openChild={openChild}
            openFile={openFile}
            t={t}
          />
        ))}
      {papers.map((paper, index) => (
        <PaperRunSection
          key={paper.runId}
          run={paper}
          index={index}
          openPath={(path) => { openFile(sessionId, resolveWorkspacePath(paper.workspace ?? workspace, path)) }}
          openChild={(childId) => { openChild(sessionId, childId) }}
          t={t}
        />
      ))}
    </div>
  )
}

/** Render the notebook view tab; its "Open beside chat" button opens the right-Sidebar notebook and selects Chat. */
export function ResearchLoopView({
  useProjection, sessionId, openChild, openFile, openNotebook, openView, completeViewRequest, t,
}: ResearchLoopViewProps): React.JSX.Element {
  const openBeside = (): void => {
    openNotebook()
    // `openView` is the only selection action a View receives; Chat takes no focus request, so clear it at once.
    openView(CHAT_VIEW, CHAT_VIEW)
    completeViewRequest()
  }
  return (
    <NotebookContent
      view={useProjection('scienceResearchLoop')}
      sessionId={sessionId}
      openChild={openChild}
      openFile={openFile}
      openBeside={openBeside}
      t={t}
    />
  )
}

/** Composed props of the right-Sidebar notebook tab. */
export type ResearchLoopPaneProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'researchLoop'>
  & ResearchNavigation

/** Render the notebook in the right Sidebar, opened from its guide card, the view tab, the dock, and the Chat card. */
export function ResearchLoopPane({ useProjection, ...rest }: ResearchLoopPaneProps): React.JSX.Element {
  return <NotebookContent view={useProjection('scienceResearchLoop')} {...rest} />
}

/** Title chip of the right-Sidebar notebook tab. */
export function ResearchLoopPaneTitle({ t }: PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'researchLoop'>): React.JSX.Element {
  return <>{t('notebook.title')}</>
}
