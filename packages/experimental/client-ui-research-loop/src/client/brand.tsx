/**
 * Research profile branding: a loop mark (five stage beads on a ring with an
 * arrowhead, over a ruled notebook page), the Science Agent · Research
 * wordmark, and the document title and favicon.
 */

import type { SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

const BEADS: readonly (readonly [number, number])[] = [[32, 15], [48.2, 26.7], [42, 45.8], [22, 45.8], [15.8, 26.7]]

/**
 * The loop mark; colors follow the active theme's ink and accent tokens.
 * Without `label` the mark is decorative and hidden from assistive technology.
 */
export function LoopMark({ size, label, className }: {
  readonly size: number
  readonly label?: string | undefined
  readonly className?: string | undefined
}): React.JSX.Element {
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" {...a11y} className={className === undefined ? 'rl-mark' : `rl-mark ${className}`}>
      <rect x="3" y="3" width="58" height="58" rx="14" className="rl-mark-page" />
      <path d="M12 52h40M12 44h6M46 44h6" className="rl-mark-rule" />
      <circle cx="32" cy="32" r="17" className="rl-mark-ring" />
      <path d="M41.8 18.6l4.6-1.2-.6 4.8" className="rl-mark-arrow" />
      {BEADS.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index === 0 ? 4 : 3.2} className={index === 0 ? 'rl-mark-bead rl-mark-bead-lead' : 'rl-mark-bead'} />)}
    </svg>
  )
}

/**
 * Decorative loop mark for the right Sidebar's guide card; the card's title names it.
 * @param props - icon size (default 20) and placement class.
 * @returns the mark.
 */
export function NotebookGuideIcon({ size = 20, className }: {
  readonly size?: number | undefined
  readonly className?: string | undefined
}): React.JSX.Element {
  return <LoopMark size={size} className={className} />
}

/** Localized brand words. */
export interface BrandWords {
  /** Brand name. */
  readonly name: string
  /** Accent word shown after the name. */
  readonly accent: string
}

/** The three brand slot occupants. */
export interface BrandOccupants {
  readonly SidebarMark: (props: SidebarBrandMarkOwnerProps) => React.JSX.Element
  readonly SidebarName: (props: SidebarBrandNameOwnerProps) => React.JSX.Element
  readonly HeroMark: (props: HeroBrandMarkOwnerProps) => React.JSX.Element
}

/**
 * Brand slot occupants whose text comes from the locale at render time.
 * @param words - reads the current brand words.
 * @returns the sidebar mark, sidebar wordmark, and hero mark occupants.
 */
export function brandOccupants(words: () => BrandWords): BrandOccupants {
  return {
    SidebarMark: function SidebarLoopMark({ size }) {
      return <LoopMark size={size} label={words().name} />
    },
    SidebarName: function SidebarResearchName() {
      const { name, accent } = words()
      return (
        <span className="rl-wordmark" aria-label={`${name} ${accent}`}>
          <span className="rl-wordmark-main">{name}</span>
          <span className="rl-wordmark-accent">{accent}</span>
        </span>
      )
    },
    HeroMark: function HeroLoopMark({ size, className }) {
      return (
        <span className={className === undefined ? 'rl-hero-mark' : `rl-hero-mark ${className}`}>
          <LoopMark size={size} label={words().name} />
        </span>
      )
    },
  }
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="14" fill="#f8faf5" stroke="#3d5a40" stroke-width="2.5"/><circle cx="32" cy="32" r="17" fill="none" stroke="#3d5a40" stroke-width="3"/><circle cx="32" cy="15" r="5" fill="#3d5a40"/><circle cx="48.2" cy="26.7" r="4" fill="#557a2f"/><circle cx="42" cy="45.8" r="4" fill="#3d5a40"/><circle cx="22" cy="45.8" r="4" fill="#3d5a40"/><circle cx="15.8" cy="26.7" r="4" fill="#3d5a40"/></svg>',
)}`

/**
 * Brand the browser tab and favicon. The app rewrites the title on navigation,
 * so a head observer re-appends the suffix whenever it goes missing.
 * @param suffix - the title suffix.
 * @returns disposer restoring the previous title and icon.
 */
export function installDocumentBrand(suffix: string): () => void {
  const originalTitle = document.title
  const suffixed = (title: string): string => (title.trim() === '' ? suffix : `${title.trim()} · ${suffix}`)
  const keepSuffix = (): void => {
    if (!document.title.endsWith(suffix)) document.title = suffixed(document.title)
  }
  const watcher = new MutationObserver(keepSuffix)
  keepSuffix()
  watcher.observe(document.head, { subtree: true, childList: true, characterData: true })

  const icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
  const saved = icons.map(icon => [icon, icon.getAttribute('href')] as const)
  const added = icons.length === 0 ? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' })) : undefined
  for (const icon of added === undefined ? icons : [added]) icon.setAttribute('href', FAVICON)

  return () => {
    watcher.disconnect()
    document.title = originalTitle
    added?.remove()
    for (const [icon, href] of saved) {
      if (href === null) icon.removeAttribute('href')
      else icon.setAttribute('href', href)
    }
  }
}
