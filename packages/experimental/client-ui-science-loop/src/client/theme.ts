/**
 * Kaggle-Arena "night manuscript" skin for the science profile: one near-black
 * neutral surface for the page, sidebar and outlined secondary buttons, a sage
 * ink accent, and book-serif headings, applied as a theme override layer so the
 * preference and every other profile stay untouched. Labels stay neutral; only
 * brand, focus, primary and send actions, and running state take the accent.
 * Body text prefers Anthropic Sans, the Claude desktop UI font, and falls back
 * to the system stack when the font is not installed.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

const same = (value: string): { light: string; dark: string } => ({ light: value, dark: value })

/** Sage ink: the one accent, for brand, focus, primary actions and running state. */
const SAGE = '#8fc7a4'

/**
 * Book serif for headings and display text. Anthropic Serif ships with the
 * Claude desktop app and is used when installed; Iowan Old Style and Songti SC
 * are bundled with macOS for Latin and CJK text.
 */
export const MANUSCRIPT_SERIF = '"Anthropic Serif", "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif'

const MARKDOWN_HEADINGS: ThemeTokenOverrides = Object.fromEntries(
  ([['h1', '22px', '31px'], ['h2', '19px', '28px'], ['h3', '17px', '26px'], ['h4', '15px', '24px']] as const).flatMap(
    ([level, size, line]) => {
      const fontSize = `calc(${size} + var(--dsh-content-font-delta))`
      const lineHeight = `calc(${line} + var(--dsh-content-font-delta))`
      return [
        [`--dsw-font-markdown-${level}-font-family`, same(MANUSCRIPT_SERIF)],
        [`--dsw-font-markdown-${level}-font-weight`, same('500')],
        [`--dsw-font-markdown-${level}-font-size`, same(fontSize)],
        [`--dsw-font-markdown-${level}`, same(`500 ${fontSize} / ${lineHeight} ${MANUSCRIPT_SERIF}`)],
      ]
    },
  ),
)

/** Token layer identity registered in the theme runtime. */
export const KAGGLE_THEME_SOURCE = 'science-agent-kaggle'

/** Alias-token overrides; both palette modes use the same near-black values. */
export const KAGGLE_THEME_TOKENS: ThemeTokenOverrides = {
  ...MARKDOWN_HEADINGS,
  '--dsw-font-family': same(
    '"Anthropic Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif',
  ),
  '--dsw-alias-bg-base': same('#151515'),
  '--dsw-alias-bg-document-preview': same('#151515'),
  '--dsw-alias-bg-layer-1': same('#1a1a1a'),
  '--dsw-alias-bg-layer-2': same('#1e1e1e'),
  '--dsw-alias-bg-layer-3': same('#252525'),
  '--dsw-alias-bg-overlay': same('#1e1e1e'),
  '--dsw-alias-bg-module-platform': same('#1c1c1c'),
  '--dsw-alias-bg-multi-select': same('#262626'),
  '--dsw-alias-bg-skeleton': same('#242424'),
  '--dsw-alias-interactive-bg-hover': same('#1f1f1f'),
  '--dsw-alias-interactive-bg-active': same('#272727'),
  '--dsw-alias-interactive-bg-hover-solid': same('#272727'),
  '--dsw-alias-border-l1': same('#212121'),
  '--dsw-alias-border-l2': same('#2b2b2b'),
  '--dsw-alias-border-l3': same('#353535'),
  '--dsw-alias-border-l4': same('#404040'),
  '--dsw-alias-illustration-background': same('#1e1e1e'),
  '--dsw-alias-illustration-backing': same('#2a2a2a'),
  '--dsw-alias-illustration-detail': same('#5a5a5a'),
  '--dsw-alias-illustration-inset': same('#2a2a2a'),
  '--dsw-alias-illustration-shadow': same('#2a2a2a'),
  '--dsw-alias-illustration-surface': same('#303030'),
  '--dsw-alias-label-primary': same('#ecebe6'),
  '--dsw-alias-label-secondary': same('#c8c5be'),
  '--dsw-alias-label-tertiary': same('#9c9891'),
  '--dsw-alias-label-caption': same('#85817a'),
  '--dsw-alias-label-dimmed': same('#75716b'),
  '--dsw-alias-brand-primary': same(SAGE),
  '--dsw-alias-label-primary-inverted': same('#04140a'),
  '--dsw-alias-state-business-primary': same(SAGE),
  '--dsw-alias-state-business-tertiary': same('#232323'),
  '--dsw-alias-brand-primary-new-colorprimary-new-color': same(SAGE),
  '--dsw-alias-state-success-primary': same(SAGE),
  '--dsw-alias-state-warn-primary': same('#f2b53d'),
  '--dsw-alias-state-error-primary': same('#ef5350'),
  '--dsw-alias-state-idle-primary': same('#75716b'),
  '--dsw-alias-link': same('#a6d3b6'),
  '--dsw-alias-button-primary-fill': same(SAGE),
  '--dsw-alias-button-primary-hover': same('#a6d3b6'),
  '--dsw-alias-button-info-fill': same('#4f8a68'),
  '--dsw-alias-button-info-hover': same('#5e9b77'),
  '--dsw-alias-button-elevated-fill': same('#151515'),
  '--dsw-alias-button-floating-fill': same('#242424'),
  '--dsw-alias-button-floating-hover': same('#2c2c2c'),
  '--dsw-alias-button-ghost-active-fill': same('#272727'),
  '--dsw-alias-button-ghost-active-border': same('#333333'),
  '--dsw-alias-markdown-code-block': same('#181818'),
  '--dsw-alias-markdown-code-block-banner': same('#1e1e1e'),
  '--dsw-alias-markdown-citation': same('#262626'),
  '--dsw-alias-markdown-inline-code': same('#242424'),
  '--dsw-alias-markdown-tag': same('#262626'),
  '--dsw-alias-tooltip-bg': same('#2c2c2c'),
  '--dsw-alias-turn-trigger-bg': same('#1f1f1f'),
  '--dsw-alias-turn-trigger-bg-hover': same('#272727'),
  '--dsw-alias-menu-icon': same('#c8c5be'),
  '--dsw-alias-scrollbar-bg-l1': same('#242424'),
  '--dsw-alias-scrollbar-bg-l2': same('#2a2a2a'),
  '--dsw-alias-scrollbar-hover-l1': same('#3a3a3a'),
  '--dsw-alias-scrollbar-hover-l2': same('#454545'),
  '--dsw-menu-surface-fill': same('rgba(38, 38, 38, 0.72)'),
  '--dsw-alias-menu-group-header-fill': same('rgba(24, 24, 24, 0.94)'),
  '--dsw-specific-menu': same('rgba(30, 30, 30, 0.94)'),
  '--dsw-specific-sidebar-fill': same('#151515'),
  '--dsw-specific-selector': same('#262626'),
  '--dsw-specific-input-major': same('#1e1e1e'),
  '--dsw-specific-login-input': same('#1e1e1e'),
  '--dsw-specific-bubble': same('#272727'),
  '--dsw-specific-bubble-highlight': same('#343434'),
  '--dsw-specific-tip': same('#262626'),
  '--dsw-alias-settings-card-fill': same('#1e1e1e'),
  '--dsw-alias-settings-card-stroke': same('#2b2b2b'),
}

/**
 * Stack the skin over the active theme for this plugin's lifetime.
 * @param ctx - browser context that owns the effect.
 */
export function installKaggleTheme(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.theme.overrideTokens(KAGGLE_THEME_SOURCE, KAGGLE_THEME_TOKENS),
    'science-agent-kaggle: theme tokens',
  )
}
