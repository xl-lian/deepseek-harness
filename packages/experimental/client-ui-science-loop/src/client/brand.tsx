/**
 * Competition branding for the science profile: the Kaggle Arena summit mark
 * (a mountain peak with a flag at the top), its wordmark, and the document
 * title/favicon.
 */

import { useId } from 'react'
import type {
  SidebarBrandMarkOwnerProps,
  SidebarBrandNameOwnerProps,
} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** The Competition mark: a summit with a flag at the peak. */
export function CompetitionMark({ size }: { readonly size: number }): React.JSX.Element {
  const raw = useId()
  const gradientId = `ka-peak-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Kaggle Arena">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#24392d" />
          <stop offset="55%" stopColor="#8fc7a4" />
          <stop offset="100%" stopColor="#d3eadb" />
        </linearGradient>
      </defs>
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="15"
        fill="#171717"
        stroke="#8fc7a4"
        strokeOpacity="0.8"
        strokeWidth="2"
      />
      <path d="M8 51 L25 23 L33 34 L43 15 L56 51 Z" fill={`url(#${gradientId})`} />
      <path d="M39.2 21.6 L43 15 L46.8 21.6 L45 23.2 L43.4 21.4 L41.6 23.4 Z" fill="#ecebe6" />
      <path d="M43 15 L43 6.6" stroke="#ecebe6" strokeWidth="2" strokeLinecap="round" />
      <path d="M43 6.6 L50 9.2 L43 11.8 Z" fill="#a6d3b6" />
    </svg>
  )
}

/** Sidebar brand mark occupant. */
export function SidebarCompetitionMark({ size }: SidebarBrandMarkOwnerProps): React.JSX.Element {
  return <CompetitionMark size={size} />
}

/** Sidebar wordmark occupant. */
export function SidebarCompetitionName(_props: SidebarBrandNameOwnerProps): React.JSX.Element {
  return (
    <span className="ka-wordmark" aria-label="Kaggle Arena">
      <span className="ka-wordmark-main">Kaggle</span>
      <span className="ka-wordmark-accent">Arena</span>
    </span>
  )
}

/** Blank-session hero mark occupant. */
export function HeroCompetitionMark({ size, className }: HeroBrandMarkOwnerProps): React.JSX.Element {
  return (
    <span className={className === undefined ? 'ka-hero-mark' : `ka-hero-mark ${className}`}>
      <CompetitionMark size={size} />
    </span>
  )
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#24392d"/><stop offset="55%" stop-color="#8fc7a4"/><stop offset="100%" stop-color="#d3eadb"/></linearGradient></defs><rect x="3" y="3" width="58" height="58" rx="15" fill="#171717" stroke="#8fc7a4" stroke-opacity=".8" stroke-width="2"/><path d="M8 51 L25 23 L33 34 L43 15 L56 51 Z" fill="url(#g)"/><path d="M39.2 21.6 L43 15 L46.8 21.6 L45 23.2 L43.4 21.4 L41.6 23.4 Z" fill="#ecebe6"/><path d="M43 15 L43 6.6" stroke="#ecebe6" stroke-width="2" stroke-linecap="round"/><path d="M43 6.6 L50 9.2 L43 11.8 Z" fill="#a6d3b6"/></svg>',
)}`

/**
 * Brand the browser tab and favicon for this profile. The app rewrites the
 * title on navigation, so a head observer keeps the suffix attached.
 * @returns disposer restoring the previous title and icon.
 */
export function installDocumentBrand(): () => void {
  const previousTitle = document.title
  const suffix = 'Kaggle Arena'
  const normalize = (): void => {
    if (document.title.includes(suffix)) return
    const current = document.title.trim()
    document.title = current === '' ? suffix : `${current} · ${suffix}`
  }
  normalize()
  const observer = new MutationObserver(() => { normalize() })
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })

  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  const previousHref = existing?.href
  const link = existing ?? document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = FAVICON
  if (existing === null) document.head.append(link)

  return () => {
    observer.disconnect()
    document.title = previousTitle
    if (existing === null) link.remove()
    else if (previousHref !== undefined) link.href = previousHref
  }
}
