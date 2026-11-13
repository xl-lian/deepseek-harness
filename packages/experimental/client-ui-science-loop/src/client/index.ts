/**
 * Browser half of the science-agent loop UI: registers the card Definition,
 * the large right-Sidebar tab, locale dictionaries, scoped styles, and the
 * keyed renderers.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionTarget } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import {
  HeroCompetitionMark,
  SidebarCompetitionMark,
  SidebarCompetitionName,
  installDocumentBrand,
} from './brand.tsx'
import { scienceLoopDefinition } from './definition.ts'
import { en, NS, zh } from './locales.ts'
import { ScienceLoopDock, type ScienceLoopDockInjected } from './ScienceLoopDock.tsx'
import { ScienceLoopLargePanel, ScienceLoopTabTitle, type ScienceLoopLargeInjected } from './ScienceLoopLargePanel.tsx'
import { ScienceLoopPanel, type ScienceLoopInjected } from './ScienceLoopPanel.tsx'
import { ScienceLoopView, scienceLoopViewDefinition, type ScienceLoopViewInjected } from './ScienceLoopView.tsx'
import { injectStyles } from './styles.ts'
import { installKaggleTheme } from './theme.ts'

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
    /** A Loop view member row expanded to show its child Session. */
    scienceLoopMember: unknown
  }
}

const IMPLEMENTATION_ID = 'science-agent-loop-ui'
const TAB_KIND = 'science-loop'

function fileAddress(sessionId: SessionId, path: string): string {
  const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `dsh-resource://file/session/${sessionId}/${encoded}`
}

/**
 * Register the loop card and its large tab.
 * @param ctx - browser Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(scienceLoopDefinition)
  ctx.uiConversation.views.register(scienceLoopViewDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'science-agent-loop: dictionaries')
  ctx.effect(() => injectStyles(), 'science-agent-loop: styles')
  installKaggleTheme(ctx)
  ctx.effect(() => installDocumentBrand(), 'science-agent-kaggle: document brand')
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark',
    priority: -1,
  }, SidebarCompetitionMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
    priority: -1,
  }, SidebarCompetitionName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
    priority: -1,
  }, HeroCompetitionMark))
  const t = ctx.locale.bind(NS)
  // Workflow children may be one-shot or continuable; a wrong mode makes the Host refuse the
  // child's history, so use the client's known address and let `unknown` skip the mode check.
  const childAddress = (parentSessionId: SessionId, childId: string): SessionTarget => {
    const childSessionId = childId as SessionId
    return ctx.sessions.subagentAddress(childSessionId) ?? { parentSessionId, childSessionId, mode: 'unknown' }
  }

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'science-loop',
    locale: NS,
    inject: (): ScienceLoopInjected => ({
      openChild: (parentSessionId, childId) => { ctx.uiWorkspace.openSession(childAddress(parentSessionId, childId)) },
      openLarge: () => { ctx.sidebarRight.openTab(TAB_KIND) },
    }),
  }, ScienceLoopPanel))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'science-loop',
    order: 5,
    locale: NS,
    inject: (): ScienceLoopDockInjected => ({
      openLarge: () => { ctx.sidebarRight.openTab(TAB_KIND) },
    }),
  }, ScienceLoopDock))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'science-loop',
    order: 20,
    locale: NS,
    label: () => t('view.loop'),
    inject: (): ScienceLoopViewInjected => ({
      openChild: (parentSessionId, childId) => { ctx.uiWorkspace.openSession(childAddress(parentSessionId, childId)) },
      openFile: (sessionId, path) => { ctx.sidebarRight.openResource(fileAddress(sessionId, path)) },
      retainChild: (parentSessionId, childId, signal) => ctx.sessions.retain(
        childAddress(parentSessionId, childId),
        { source: 'scienceLoopMember', signal },
      ),
    }),
  }, ScienceLoopView))

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: IMPLEMENTATION_ID,
    kind: TAB_KIND,
    title: () => en.title,
  }), 'science-agent-loop: sidebar tab')

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: IMPLEMENTATION_ID,
    locale: NS,
    inject: (): ScienceLoopLargeInjected => ({
      openChild: (parentSessionId, childId) => { ctx.uiWorkspace.openSession(childAddress(parentSessionId, childId)) },
      openFile: (sessionId, path) => { ctx.sidebarRight.openResource(fileAddress(sessionId, path)) },
    }),
  }, ScienceLoopLargePanel))

  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: IMPLEMENTATION_ID,
    locale: NS,
  }, ScienceLoopTabTitle))
}
