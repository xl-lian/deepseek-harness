/**
 * Lab-notebook skin for the research profile: warm paper surfaces, ink labels,
 * an indigo accent for brand, focus, primary actions, and running state, teal
 * for success, and serif markdown headings. Light and dark modes follow the
 * stored theme preference; the layer is a theme override, so the preference
 * and every other profile stay untouched.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Serif stack for headings: system book faces for Latin and CJK text. */
export const NOTEBOOK_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif'

/** Token layer identity registered in the theme runtime. */
export const NOTEBOOK_THEME_SOURCE = 'science-research-notebook'

/** Palette roles; each tuple is `[light, dark]`. */
const PALETTE = {
  paper: ['#fbfaf7', '#1b1a18'],
  surface: ['#ffffff', '#242321'],
  sunken: ['#f6f4ee', '#211f1d'],
  raised: ['#efece4', '#2e2c29'],
  rule1: ['#ece9e1', '#2f2e2b'],
  rule2: ['#e3e1d9', '#3a3935'],
  rule3: ['#d6d3c9', '#46443f'],
  rule4: ['#c4c0b5', '#55534d'],
  ink: ['#232321', '#f1efe8'],
  ink2: ['#4a4945', '#d3d1c9'],
  ink3: ['#6b6963', '#b4b2a9'],
  caption: ['#7d7a72', '#9a988f'],
  dimmed: ['#97948b', '#84827a'],
  indigo: ['#534ab7', '#afa9ec'],
  indigoHover: ['#463ea3', '#c4bff2'],
  indigoWash: ['#eeedfe', '#2b2750'],
  onIndigo: ['#ffffff', '#1b1a18'],
  teal: ['#0f6e56', '#5dcaa5'],
  amber: ['#a15c07', '#f2b53d'],
  red: ['#b42318', '#f28b82'],
  code: ['#f1efe8', '#2c2b28'],
  hover: ['#f1efe8', '#2a2926'],
  active: ['#e9e6dd', '#33312e'],
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
  '--dsw-alias-bg-multi-select': 'indigoWash',
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
  '--dsw-alias-label-primary-inverted': 'onIndigo',
  '--dsw-alias-brand-primary': 'indigo',
  '--dsw-alias-brand-primary-new-colorprimary-new-color': 'indigo',
  '--dsw-alias-state-business-primary': 'indigo',
  '--dsw-alias-state-business-tertiary': 'indigoWash',
  '--dsw-alias-state-success-primary': 'teal',
  '--dsw-alias-state-warn-primary': 'amber',
  '--dsw-alias-state-error-primary': 'red',
  '--dsw-alias-state-idle-primary': 'dimmed',
  '--dsw-alias-link': 'indigo',
  '--dsw-alias-button-primary-fill': 'indigo',
  '--dsw-alias-button-primary-hover': 'indigoHover',
  '--dsw-alias-markdown-code-block': 'code',
  '--dsw-alias-markdown-code-block-banner': 'raised',
  '--dsw-alias-markdown-inline-code': 'code',
  '--dsw-alias-markdown-citation': 'indigoWash',
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
