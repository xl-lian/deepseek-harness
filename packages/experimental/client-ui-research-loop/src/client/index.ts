/**
 * Browser half of the notebook UI: registers the Chat card Definitions for
 * research runs, campaign rounds, and paper runs, the notebook view tab, the
 * dock, the right-Sidebar notebook tab, locale dictionaries, scoped styles, the
 * lab-notebook theme layer, and the brand.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionTarget } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
// Type-only: the Context service merges this plugin injects and the renderer slot types.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { brandOccupants, installDocumentBrand, NotebookGuideIcon } from './brand.tsx'
import { CampaignCard, type CampaignCardInjected } from './CampaignCard.tsx'
import { researchCampaignDefinition, researchLoopDefinition, researchPaperDefinition } from './definition.ts'
import { en, NS, zh } from './locales.ts'
import { PaperCard, type PaperCardInjected } from './PaperSection.tsx'
import { ResearchLoopCard, type ResearchLoopCardInjected } from './ResearchLoopCard.tsx'
import { ResearchLoopDock, type ResearchLoopDockInjected } from './ResearchLoopDock.tsx'
import {
  ResearchLoopPane,
  ResearchLoopPaneTitle,
  ResearchLoopView,
  researchLoopViewDefinition,
  type ResearchLoopViewInjected,
  type ResearchNavigation,
} from './ResearchLoopView.tsx'
import { injectStyles } from './styles.ts'
import { installNotebookTheme } from './theme.ts'

/** Required browser services for the Definition, renderers, navigation, theme, and copy. */
export const inject = [
  'uiConversation',
  'uiWorkspace',
  'sidebarRight',
  'sidebarRightTabs',
  'slots',
  'sessions',
  'locale',
  'theme',
]

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** A notebook campaign member row expanded to show its child Session. */
    researchNotebookMember: unknown
  }
}

const IMPLEMENTATION_ID = 'science-research-loop-ui'
const TAB_KIND = 'research-notebook'

/**
 * Register every research loop surface for this plugin's lifetime.
 * @param ctx - browser Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(researchLoopDefinition)
  ctx.uiConversation.events.register(researchPaperDefinition)
  ctx.uiConversation.events.register(researchCampaignDefinition)
  ctx.uiConversation.views.register(researchLoopViewDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'science-research: dictionaries')
  ctx.effect(() => injectStyles(), 'science-research: styles')
  installNotebookTheme(ctx)
  const t = ctx.locale.bind(NS)
  ctx.effect(() => installDocumentBrand(`${t('brand.name')} · ${t('brand.accent')}`), 'science-research: document brand')

  const brand = brandOccupants(() => ({ name: t('brand.name'), accent: t('brand.accent') }))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, brand.SidebarMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 }, brand.SidebarName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: -1 }, brand.HeroMark))

  // Workflow children may be one-shot or continuable; use the client's known address, else `unknown` skips the mode check.
  const childAddress = (parentSessionId: SessionId, childId: string): SessionTarget => {
    const childSessionId = childId as SessionId
    return ctx.sessions.subagentAddress(childSessionId) ?? { parentSessionId, childSessionId, mode: 'unknown' }
  }
  const navigation = (): ResearchNavigation => ({
    openChild: (parentSessionId, childId) => { ctx.uiWorkspace.openSession(childAddress(parentSessionId, childId)) },
    openFile: (sessionId, path) => { ctx.sidebarRight.openResource(sessionFileAddress(sessionId, path)) },
    retainChild: (parentSessionId, childId, signal) => ctx.sessions.retain(
      childAddress(parentSessionId, childId),
      { source: 'researchNotebookMember', signal },
    ),
  })
  const openNotebook = (): void => { ctx.sidebarRight.openTab(TAB_KIND) }

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'research-loop',
    order: 20,
    locale: NS,
    label: () => t('view.loop'),
    inject: (): ResearchLoopViewInjected => ({ ...navigation(), openNotebook }),
  }, ResearchLoopView))

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'research-loop',
    locale: NS,
    inject: (): ResearchLoopCardInjected => ({ openNotebook }),
  }, ResearchLoopCard))

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'research-paper',
    locale: NS,
    inject: (): PaperCardInjected => ({ openNotebook }),
  }, PaperCard))

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'research-campaign',
    locale: NS,
    inject: (): CampaignCardInjected => ({ openChild: navigation().openChild, openNotebook }),
  }, CampaignCard))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'research-loop',
    order: 5,
    locale: NS,
    inject: (): ResearchLoopDockInjected => ({ openNotebook }),
  }, ResearchLoopDock))

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: IMPLEMENTATION_ID,
    kind: TAB_KIND,
    title: () => t('notebook.title'),
    guide: [{ id: 'open', order: 15, title: () => t('notebook.title'), description: () => t('notebook.guide'), icon: NotebookGuideIcon }],
  }), 'science-research: notebook sidebar tab')

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: IMPLEMENTATION_ID,
    locale: NS,
    inject: navigation,
  }, ResearchLoopPane))

  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: IMPLEMENTATION_ID,
    locale: NS,
  }, ResearchLoopPaneTitle))
}
