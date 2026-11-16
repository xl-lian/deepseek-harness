/**
 * Lab-notebook skin for the research profile: sage-tinted surfaces and ink
 * labels, a forest-green accent for brand, focus, primary actions, and running
 * state, an olive green for success, and serif markdown headings. Light
 * and dark modes follow the stored theme preference; the layer is a theme
 * override, so the preference and every other profile stay untouched.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Serif stack for headings: system book faces for Latin and CJK text. */
export const NOTEBOOK_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif'

/** Token layer identity registered in the theme runtime. */
export const NOTEBOOK_THEME_SOURCE = 'science-research-notebook'

/** Palette roles; each tuple is `[light, dark]`. */
const PALETTE = {
  paper: ['#f8faf5', '#141a16'],
  surface: ['#ffffff', '#1b221d'],
  sunken: ['#f1f3e9', '#171d19'],
  raised: ['#e9eedf', '#252d27'],
  rule1: ['#e5e9e1', '#252d27'],
  rule2: ['#dfe4d6', '#2f3830'],
  rule3: ['#cfd7c3', '#3b453c'],
  rule4: ['#b8c2a9', '#4b564c'],
  ink: ['#1c2e26', '#e8eee6'],
  ink2: ['#48544a', '#c6cfc3'],
  ink3: ['#646e60', '#a4ad9f'],
  caption: ['#81887a', '#8c9588'],
  dimmed: ['#9ca393', '#737c70'],
  accent: ['#3d5a40', '#9cc49a'],
  accentHover: ['#304834', '#b3d4b0'],
  accentWash: ['#e1e8d4', '#253425'],
  onAccent: ['#ffffff', '#141a16'],
  success: ['#557a2f', '#b5cf6b'],
  amber: ['#9a6408', '#e8b04a'],
  red: ['#b0412e', '#ef8a7a'],
  code: ['#f1f4ec', '#202721'],
  hover: ['#eef1e7', '#1f2721'],
  active: ['#e3e9d8', '#283129'],
} as const satisfies Record<string, readonly [string, string]>

type Role = keyof typeof PALETTE

const pair = (role: Role): { light: string; dark: string } => ({ light: PALETTE[role][0], dark: PALETTE[role][1] })
const same = (value: string): { light: string; dark: string } => ({ light: value, dark: value })

/** Markdown heading sizes and line heights in pixels, before the content font delta. */
const HEADING_SCALE: Readonly<Record<string, readonly [number, number]>> = { h1: [22, 31], h2: [19, 28], h3: [17, 26], h4: [15, 24] }

const scaled = (pixels: number): string => `calc(${pixels}px + var(--dsh-content-font-delta))`

const MARKDOWN_HEADINGS: ThemeTokenOverrides = {}
for (const [level, [size, line]] of Object.entries(HEADING_SCALE)) {
  const prefix = `--dsw-font-markdown-${level}`
  MARKDOWN_HEADINGS[`${prefix}-font-family`] = same(NOTEBOOK_SERIF)
  MARKDOWN_HEADINGS[`${prefix}-font-weight`] = same('600')
  MARKDOWN_HEADINGS[`${prefix}-font-size`] = same(scaled(size))
  MARKDOWN_HEADINGS[prefix] = same(`600 ${scaled(size)} / ${scaled(line)} ${NOTEBOOK_SERIF}`)
}

/** Token role per alias token. */
const TOKEN_ROLES: Readonly<Record<string, Role>> = {
  '--dsw-alias-bg-base': 'paper',
  '--dsw-alias-bg-document-preview': 'paper',
  '--dsw-alias-bg-layer-1': 'surface',
  '--dsw-alias-bg-layer-2': 'sunken',
  '--dsw-alias-bg-layer-3': 'raised',
  '--dsw-alias-bg-overlay': 'surface',
  '--dsw-alias-bg-module-platform': 'sunken',
  '--dsw-alias-bg-multi-select': 'accentWash',
  '--dsw-alias-bg-skeleton': 'raised',
  '--dsw-alias-interactive-bg-hover': 'hover',
  '--dsw-alias-interactive-bg-active': 'active',
  '--dsw-alias-interactive-bg-hover-solid': 'active',
  '--dsw-alias-border-l1': 'rule1',
  '--dsw-alias-border-l2': 'rule2',
  '--dsw-alias-border-l3': 'rule3',
  '--dsw-alias-border-l4': 'rule4',
  '--dsw-alias-label-primary': 'ink',
  '--dsw-alias-label-secondary': 'ink2',
  '--dsw-alias-label-tertiary': 'ink3',
  '--dsw-alias-label-caption': 'caption',
  '--dsw-alias-label-dimmed': 'dimmed',
  '--dsw-alias-label-primary-inverted': 'onAccent',
  '--dsw-alias-brand-primary': 'accent',
  '--dsw-alias-brand-primary-new-colorprimary-new-color': 'accent',
  '--dsw-alias-state-business-primary': 'accent',
  '--dsw-alias-state-business-tertiary': 'accentWash',
  '--dsw-alias-state-success-primary': 'success',
  '--dsw-alias-state-warn-primary': 'amber',
  '--dsw-alias-state-error-primary': 'red',
  '--dsw-alias-state-idle-primary': 'dimmed',
  '--dsw-alias-link': 'accent',
  '--dsw-alias-button-primary-fill': 'accent',
  '--dsw-alias-button-primary-hover': 'accentHover',
  '--dsw-alias-markdown-code-block': 'code',
  '--dsw-alias-markdown-code-block-banner': 'raised',
  '--dsw-alias-markdown-inline-code': 'code',
  '--dsw-alias-markdown-citation': 'accentWash',
  '--dsw-alias-markdown-tag': 'raised',
  '--dsw-specific-sidebar-fill': 'sunken',
  '--dsw-specific-input-major': 'surface',
  '--dsw-specific-bubble': 'raised',
  '--dsw-alias-settings-card-fill': 'surface',
  '--dsw-alias-settings-card-stroke': 'rule2',
}

/** Alias-token overrides with distinct light and dark values. */
export const NOTEBOOK_THEME_TOKENS: ThemeTokenOverrides = {
  ...MARKDOWN_HEADINGS,
  ...Object.fromEntries(Object.entries(TOKEN_ROLES).map(([token, role]) => [token, pair(role)])),
}

/**
 * Stack the skin over the active theme for this plugin's lifetime.
 * @param ctx - browser context that owns the effect.
 */
export function installNotebookTheme(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens(NOTEBOOK_THEME_SOURCE, NOTEBOOK_THEME_TOKENS), 'science-research: notebook theme tokens')
}
