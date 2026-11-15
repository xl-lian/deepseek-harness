/** TeX source previewed as the PDF compiled from it, through the shared PDF view. */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsStore, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { Button, FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { DocumentBodyOwner, DocumentPreviewProps } from '../document/contract.ts'
import { useRendererRequest } from '../document/renderer-request.ts'
import { hostFileOf } from '../rpc.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import type { TexLoadInjected } from './face.ts'
import type { TexStore } from './store.ts'
import common from '../TextPreview.module.css'
import css from './TexBody.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** PDF presentation supplied with the PDF a TeX source compiled to. */
    'sidebar.right.tab.document.tex.pdf': {
      kind: 'keyed'
      scope: 'session'
      owner: DocumentBodyOwner
      hookContext: UseSidebarRightTabInfo
      inject: { hooks: { tabInfo: SlotHookFactory<'sidebar.right.tab.document', UseSidebarRightTabInfo> } }
    }
  }
}

/** TeX lookup callbacks supplied by the registration's services. */
export interface TexBodyInjected extends TexLoadInjected {
  /** @param tab - owning tab. @param signal - tab lifetime, including hidden bodies. */
  readonly retainTab: (tab: TabId, signal: AbortSignal) => void
}

/** TeX body inputs and its private PDF child. */
export type TexBodyProps = DocumentPreviewProps & PropsStore<TexStore> & TexBodyInjected
  & PropsLocale<'sidebarTex'> & PropsRenderSlots<'sidebar.right.tab.document.tex.pdf'>

/** Implementation identity shared by the TeX metadata, body, and nested PDF entry. */
export const TEX_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/tex'

/**
 * Find the PDF one TeX revision compiled to and keep it while the tab remains open.
 * @param props - renderer loading request, tab state, lookup callbacks, and PDF slot.
 * @returns lookup status, the paths searched, or the PDF scrollport.
 */
export function TexBody(props: TexBodyProps): ReactNode {
  const { tab } = props.useTabInfo()
  const { load, retainTab, resourceAddress, addResource, t } = props
  const revision = props.content.kind === 'renderer' ? props.content.revision : undefined
  const held = props.useStore(state => state.byTab[tab.id])
  const view = held?.revision === revision ? held : undefined
  const settled = view?.found !== undefined || view?.failure !== undefined || view?.searched !== undefined
  const request = useRendererRequest(props.content, tab, settled, retainTab, (next, signal) => {
    const file = hostFileOf(resourceAddress)
    load(tab.id, next.revision, file, signal, next.loaded, next.failed, (path) => {
      addResource(sessionFileAddress(file.sessionId, path))
    })
  }, [resourceAddress, load])
  if (request === undefined) return null
  if (view?.searched !== undefined || view?.failure !== undefined) {
    return <div className={common.empty} data-tex-preview={view.failure === undefined ? 'no-pdf' : view.failure.code}>
      <FileTypeIcon kind="pdf" size={36} />
      <p className={common.emptyLine}>{view.failure?.message ?? t('missing')}</p>
      {view.searched === undefined ? null : (
        <ul className={css.searched} aria-label={t('searched')}>
          {view.searched.map(path => <li key={path}><code>{path}</code></li>)}
        </ul>
      )}
      <Button size="sm" onClick={request.reload}>{t('retry')}</Button>
    </div>
  }
  const found = view?.found
  if (found === undefined) return <LoadingIndicator label={t('loading')} />
  return <div className={css.body}>
    <p className={css.source} title={found.path}>{t('showing', { path: found.path })}</p>
    <div className={css.pdf}>
      {props.renderSlot('sidebar.right.tab.document.tex.pdf', {
        resourceAddress, content: { kind: 'bytes', data: found.pdf.data }, wrap: props.wrap, scrollportRef: props.scrollportRef,
        addResource, setResources: props.setResources,
      }, { entryKey: TEX_BODY_ID, hookContext: props.useTabInfo })}
    </div>
  </div>
}
