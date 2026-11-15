/** TeX preview lookup: read the first candidate PDF that exists and settle the tab's view. */
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { ReadDocumentBytes, SessionFile } from '../rpc.ts'
import { pdfCandidates } from './candidates.ts'
import type { TexStore } from './store.ts'

/** A candidate that is absent or not a regular file; the lookup moves on to the next. */
const ABSENT: ReadonlySet<string> = new Set(['workspace-file/not-found', 'workspace-file/not-regular-file'])

/** Lookup callback supplied to the TeX body through Slot injection. */
export interface TexLoadInjected {
  /**
   * Find and read the compiled PDF for one source revision; cancellation suppresses every report.
   * @param tabId - owning tab.
   * @param revision - requested content revision.
   * @param file - the `.tex` file's Session and path.
   * @param signal - request lifetime, cancelled on replacement, unmount, or tab closure.
   * @param loaded - report the shown PDF's version to the document owner.
   * @param failed - report a lookup that showed nothing.
   * @param watch - observe the shown PDF so a rebuild reloads the preview.
   */
  readonly load: (
    tabId: TabId,
    revision: number,
    file: SessionFile,
    signal: AbortSignal,
    loaded: (version: string) => void,
    failed: () => void,
    watch: (path: string) => void,
  ) => void
}

/**
 * Bind PDF lookups to store actions without exposing Remote work to the component.
 * @param read - complete-file reader.
 * @param describeFailure - localized text for a read failure other than an absent candidate.
 * @returns Slot inject factory; the file address supplies the read's Session authority.
 */
export function texFace(
  read: ReadDocumentBytes,
  describeFailure: (failure: RemoteFailure | { readonly message: string }) => string,
): (sessionId: SessionId, actions: BoundActions<TexStore>) => TexLoadInjected {
  return (_sessionId, actions) => ({
    load: (tabId, revision, file, signal, loaded, failed, watch) => {
      if (signal.aborted) return
      actions.begin(tabId, revision)
      const searched = pdfCandidates(file.path)
      const next = async (index: number): Promise<void> => {
        const path = searched[index]
        if (path === undefined) {
          actions.settle(tabId, { revision, searched })
          failed()
          return
        }
        const result = await read({ sessionId: file.sessionId, path }, signal)
        if (signal.aborted) return
        if (result.ok) {
          actions.settle(tabId, { revision, found: { path, pdf: result.value } })
          watch(path)
          loaded(result.value.version)
        } else if (ABSENT.has(result.error.code)) {
          await next(index + 1)
        } else {
          actions.settle(tabId, { revision, failure: { code: result.error.code, message: describeFailure(result.error) } })
          failed()
        }
      }
      next(0).catch((error: unknown) => {
        if (signal.aborted) return
        const message = describeFailure({ message: error instanceof Error ? error.message : String(error) })
        actions.settle(tabId, { revision, failure: { code: 'gateway/internal', message } })
        failed()
      })
    },
  })
}
