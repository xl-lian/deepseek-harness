/** Renderer-mode bodies share one load lifecycle: retain tab state, start each revision once, cancel on replacement. */
import { useEffect } from 'react'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { DocumentContent } from './contract.ts'

/** The owner's request for a renderer-loaded revision. */
export type RendererRequest = Extract<DocumentContent, { readonly kind: 'renderer' }>

/**
 * Retain the tab's renderer state and start the load of each unsettled revision.
 * @param content - the owner's content; only a renderer request starts a load.
 * @param tab - owning tab identity and lifetime.
 * @param settled - whether the current revision already has a result or failure.
 * @param retainTab - keep the renderer's tab state until the tab closes.
 * @param start - begin one load; its signal aborts on replacement, unmount, or tab closure.
 * @param inputs - further values whose change restarts an unsettled load, such as the resource address and load callback.
 * @returns the renderer request, or `undefined` for ordinary shared content.
 */
export function useRendererRequest(
  content: DocumentContent,
  tab: { readonly id: TabId; readonly signal: AbortSignal },
  settled: boolean,
  retainTab: (tab: TabId, signal: AbortSignal) => void,
  start: (request: RendererRequest, signal: AbortSignal) => void,
  inputs: readonly unknown[],
): RendererRequest | undefined {
  const request = content.kind === 'renderer' ? content : undefined
  useEffect(() => { retainTab(tab.id, tab.signal) }, [retainTab, tab.id, tab.signal])
  // Metadata may replace callbacks without advancing the content revision.
  useEffect(() => {
    if (request === undefined || settled || tab.signal.aborted) return
    const controller = new AbortController()
    start(request, AbortSignal.any([controller.signal, tab.signal]))
    return () => { controller.abort() }
  }, [request?.revision, tab.id, tab.signal, settled, ...inputs])
  return request
}
