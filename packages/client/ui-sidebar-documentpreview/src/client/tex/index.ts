/** TeX preview registration: a `.tex` file shown as the PDF compiled from it, through the shared PDF body. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import { retainDocumentTabs } from '../document/tab-lifetime.ts'
import { documentTabInfoFactory } from '../document/contract.ts'
import { failureLine } from '../failure-line.ts'
import type { ReadDocumentBytes } from '../rpc.ts'
import { pdfBodyRegistration } from '../pdf/index.ts'
import { LazyPdfBody } from '../pdf/LazyPdfBody.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type TexPreviewKey } from './locales.ts'
import { TEX_BODY_ID, TexBody, type TexBodyInjected } from './TexBody.tsx'
import { texFace } from './face.ts'
import { createTexStore } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sidebarTex: TexPreviewKey
  }
}

/**
 * Register the TeX preview: it ranks above the code view for `.tex`, and the viewer menu still offers code and text.
 * @param ctx - Client renderer registry, localized copy, and the workspace file Remote.
 * @param read - complete-file reader bound to the workspace file Remote.
 */
export function apply(ctx: Context, read: ReadDocumentBytes): void {
  ctx.effect(() => ctx.locale.register('sidebarTex', { zh, en, ja, es, fr, de, ru, pt }))
  const t = ctx.locale.bind('sidebarTex')
  ctx.effect(() => ctx.documentPreviews.register({
    id: TEX_BODY_ID, extensions: ['tex', 'ltx'], priority: 'extension', title: () => t('title'), loading: 'renderer', wrap: false,
  }))
  const store = createTexStore()
  const retainTab = retainDocumentTabs(ctx)
  const documentT = ctx.locale.bind('sidebarDocumentPreview')
  const face = texFace(read, failure => ('code' in failure ? failureLine(documentT, failure) : documentT('error.unavailable', { message: failure.message })))
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document', key: TEX_BODY_ID, locale: 'sidebarTex', store,
    children: { 'sidebar.right.tab.document.tex.pdf': {
      kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: documentTabInfoFactory } },
    } },
    inject: (sessionId, actions): TexBodyInjected => ({
      ...face(sessionId, actions),
      retainTab: (tabId, signal) => { retainTab(tabId, signal, actions.forget) },
    }),
  }, TexBody)))
  const pdfPresentation = pdfBodyRegistration(ctx)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.tex.pdf', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.tex.pdf', key: TEX_BODY_ID, locale: 'sidebarPdf', ...pdfPresentation,
  }, LazyPdfBody)))
}
