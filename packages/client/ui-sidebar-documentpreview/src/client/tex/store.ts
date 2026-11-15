/** TeX previews keep the PDF they found until reload or tab closure. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { DocumentFileBytes } from '../rpc.ts'

/** One request for a source revision: the PDF found, or why none is shown. */
export interface TexView {
  readonly revision: number
  /** The PDF shown and its workspace path, as the lookup addressed it. */
  readonly found?: { readonly path: string; readonly pdf: DocumentFileBytes }
  /** Every path tried when no PDF was found. */
  readonly searched?: readonly string[]
  readonly failure?: { readonly code: string; readonly message: string }
}

type TexActions = {
  begin: (state: { byTab: Record<TabId, TexView> }, tab: TabId, revision: number) => void
  settle: (state: { byTab: Record<TabId, TexView> }, tab: TabId, view: TexView) => void
  forget: (state: { byTab: Record<TabId, TexView> }, tab: TabId) => void
}

/**
 * Retain each tab's TeX preview across body remounts within a Session.
 * @returns the tab-content store declaration.
 */
export function createTexStore(): EngineStoreHandle<{ byTab: Record<TabId, TexView> }, TexActions> {
  return defineStore({
    init: () => ({ byTab: {} as Record<TabId, TexView> }),
    actions: {
      /** @param state - draft. @param tab - owning tab. @param revision - requested content revision. */
      begin(state, tab: TabId, revision: number) { state.byTab[tab] = { revision } },
      /** @param state - draft. @param tab - owning tab. @param view - the settled lookup for that revision. */
      settle(state, tab: TabId, view: TexView) { state.byTab[tab] = view },
      /** @param state - draft. @param tab - closed tab. */
      forget(state, tab: TabId) {
        const { [tab]: _closed, ...remaining } = state.byTab
        state.byTab = remaining
      },
    },
  })
}

/** Store declaration used by the TeX body. */
export type TexStore = ReturnType<typeof createTexStore>
