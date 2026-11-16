/**
 * Lab-notebook skin for the research profile: neutral surfaces and ink
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
  paper: ['#fafaf9', '#161616'],
  surface: ['#ffffff', '#1d1d1d'],
  sunken: ['#f4f4f3', '#191919'],
  raised: ['#ececea', '#272727'],
  rule1: ['#e8e8e6', '#262626'],
  rule2: ['#e0e0dd', '#303030'],
  rule3: ['#d0d0cc', '#3c3c3c'],
  rule4: ['#b9b9b4', '#4c4c4c'],
  ink: ['#222222', '#ececec'],
  ink2: ['#4b4b49', '#cacaca'],
  ink3: ['#666664', '#a6a6a6'],
  caption: ['#82827f', '#8e8e8e'],
  dimmed: ['#9d9d99', '#757575'],
  accent: ['#3d5a40', '#9cc49a'],
  accentHover: ['#304834', '#b3d4b0'],
  accentWash: ['#e1e8d4', '#253425'],
  onAccent: ['#ffffff', '#161616'],
  success: ['#557a2f', '#b5cf6b'],
  amber: ['#9a6408', '#e8b04a'],
  red: ['#b0412e', '#ef8a7a'],
  code: ['#f2f2f0', '#222222'],
  hover: ['#f0f0ee', '#222222'],
  active: ['#e6e6e3', '#2b2b2b'],
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
