/**
 * Scoped styles for the research loop surfaces in the lab-notebook style:
 * graph-paper ground, serif section heads, ruled tables, tabular numerals, and
 * monospace ids. Colors come from the web client's alias tokens, which the
 * notebook theme layer sets for light and dark modes. Verdicts always pair a
 * color with a text label.
 */

const SERIF = 'var(--dsw-font-markdown-h3-font-family, "Iowan Old Style", Palatino, "Songti SC", Georgia, serif)'
const INK = 'var(--dsw-alias-label-primary, #232321)'
const INK2 = 'var(--dsw-alias-label-secondary, #4a4945)'
const INK3 = 'var(--dsw-alias-label-tertiary, #6b6963)'
const RULE = 'var(--dsw-alias-border-l2, #e3e1d9)'
const RULE_FAINT = 'var(--dsw-alias-border-l1, #ece9e1)'
const SURFACE = 'var(--dsw-alias-bg-layer-1, #ffffff)'
const SUNKEN = 'var(--dsw-alias-bg-layer-2, #f6f4ee)'
const ACCENT = 'var(--dsw-alias-brand-primary, #534ab7)'
const WASH = 'var(--dsw-alias-state-business-tertiary, #eeedfe)'
const OK = 'var(--dsw-alias-state-success-primary, #0f6e56)'
const WARN = 'var(--dsw-alias-state-warn-primary, #a15c07)'
const BAD = 'var(--dsw-alias-state-error-primary, #b42318)'
const IDLE = 'var(--dsw-alias-state-idle-primary, #97948b)'

const STYLES = `
.rl-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.rl-mark-page{fill:${SURFACE};stroke:${ACCENT};stroke-width:2.5}
.rl-mark-rule{stroke:${RULE};stroke-width:2;stroke-linecap:round;fill:none}
.rl-mark-ring{fill:none;stroke:${ACCENT};stroke-width:2.6}
.rl-mark-arrow{fill:none;stroke:${ACCENT};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.rl-mark-bead{fill:${ACCENT}}
.rl-mark-bead-lead{fill:${OK}}
.rl-hero-mark{display:inline-flex;align-items:center;justify-content:center}
.rl-wordmark{display:inline-flex;flex-direction:column;justify-content:center;gap:2px;font-family:${SERIF};line-height:1;white-space:nowrap}
.rl-wordmark-main{color:${INK};font-size:15px;font-weight:600}
.rl-wordmark-accent{color:${ACCENT};font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
.rl-view{display:flex;flex-direction:column;gap:18px;padding:16px;flex:1 1 auto;height:100%;min-height:0;overflow:auto;box-sizing:border-box;color:${INK};font-variant-numeric:tabular-nums;
  background-image:linear-gradient(${RULE_FAINT} 1px,transparent 1px),linear-gradient(90deg,${RULE_FAINT} 1px,transparent 1px);background-size:24px 24px;background-position:-1px -1px}
.rl-view>*{flex-shrink:0}
.rl-notebook,.rl-run,.rl-card{background:${SURFACE};border:1px solid ${RULE};border-radius:10px}
.rl-notebook{padding:14px 16px;display:flex;flex-direction:column;gap:8px;border-left:3px solid ${ACCENT}}
.rl-notebook-head,.rl-run-head,.rl-round-head,.rl-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.rl-notebook-title,.rl-run-title,.rl-round-title{margin:0;font-family:${SERIF};font-weight:600;color:${INK}}
.rl-notebook-title{font-size:17px}
.rl-beside{margin-left:auto}
.rl-paper-title{margin:0;font-family:${SERIF};font-size:17px;line-height:1.35;color:${INK}}
.rl-paper-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.rl-paper-grid section,.rl-paper>section{display:flex;flex-direction:column;gap:6px}
.rl-paper-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.rl-paper-review{margin:0;font-size:13px;line-height:1.5}
.rl-paper-steps{margin-top:6px}
.rl-paper li[data-blocking="true"]{color:${BAD}}
.rl-run-title{font-size:16px}
.rl-round-title{font-size:15px}
.rl-question{margin:0;font-family:${SERIF};font-size:15px;font-style:italic;color:${INK2};line-height:1.5}
.rl-notebook-links{display:flex;flex-wrap:wrap;gap:6px 14px}
.rl-path,.rl-round-id,.rl-exp-id,.rl-runs .rl-link{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.rl-path{color:${INK3};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.rl-muted{color:${INK3};font-size:13px;margin:0}
.rl-run{padding:14px 16px;display:flex;flex-direction:column;gap:14px}
.rl-phase{font-size:12px;color:${ACCENT};background:${WASH};border-radius:999px;padding:1px 8px}
.rl-elapsed{margin-left:auto;font-size:12px;color:${INK3}}
.rl-round{border-top:1px solid ${RULE};padding-top:12px;display:flex;flex-direction:column;gap:10px}
.rl-round-id{color:${INK3}}
.rl-tag{font-size:11px;color:${INK3};border:1px solid ${RULE};border-radius:999px;padding:0 6px}
.rl-rail{list-style:none;display:flex;gap:4px;margin:0 0 0 auto;padding:0;flex-wrap:wrap}
.rl-rail[data-compact="true"]{margin:0}
.rl-rail-step{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:${INK3};padding:2px 8px 2px 3px;border-radius:999px;border:1px solid ${RULE}}
.rl-rail-index{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;font-size:10px;background:${SUNKEN};color:${INK3}}
.rl-rail-step[data-status="running"]{color:${ACCENT};border-color:${ACCENT}}
.rl-rail-step[data-status="running"] .rl-rail-index{background:${ACCENT};color:var(--dsw-alias-label-primary-inverted,#fff)}
.rl-rail-step[data-status="completed"]{color:${INK2}}
.rl-rail-step[data-status="completed"] .rl-rail-index{background:${OK};color:var(--dsw-alias-label-primary-inverted,#fff)}
.rl-rail-step[data-status="failed"]{color:${BAD};border-color:${BAD}}
.rl-rail[data-compact="true"] .rl-rail-label{display:none}
.rl-rail[data-compact="true"] .rl-rail-step{padding:2px}
.rl-round-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.rl-section{background:${SUNKEN};border:1px solid ${RULE_FAINT};border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.rl-section[data-stage="experiment"]{grid-column:1/-1}
.rl-section-title{margin:0;display:flex;align-items:center;gap:6px;font-family:${SERIF};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${INK2}}
.rl-section p{margin:0;font-size:13px;line-height:1.5}
.rl-dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:${IDLE}}
.rl-dot[data-status="running"]{background:${ACCENT};box-shadow:0 0 0 3px ${WASH};animation:rl-pulse 1.4s ease-in-out infinite}
.rl-dot[data-status="completed"]{background:${OK}}
.rl-dot[data-status="failed"]{background:${BAD}}
.rl-dot[data-status="cancelled"]{background:${WARN}}
@keyframes rl-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.rl-dot[data-status="running"]{animation:none}}
.rl-link{all:unset;cursor:pointer;color:${ACCENT};font-size:13px;text-decoration:underline;text-decoration-color:color-mix(in srgb,${ACCENT} 35%,transparent);text-underline-offset:2px}
.rl-link:hover{text-decoration-color:${ACCENT}}
.rl-link:focus-visible,.rl-chip:focus-visible,.rl-exp-toggle:focus-visible,.rl-dock:focus-visible,.rl-icon-link:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px;border-radius:4px}
.rl-icon-link{all:unset;cursor:pointer;color:${INK3};font-size:12px;padding:0 2px}
.rl-focus-list,.rl-list,.rl-notes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px}
.rl-list{padding-left:12px;list-style:disc}
.rl-notes{color:${INK3};font-size:12px}
.rl-focus{display:flex;align-items:center;gap:6px}
.rl-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.rl-chip{all:unset;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:${INK2};border:1px solid ${RULE};border-radius:6px;padding:1px 7px;background:${SURFACE}}
button.rl-chip{cursor:pointer}
button.rl-chip:hover{border-color:${ACCENT}}
.rl-count{font-size:12px;color:${INK2};background:${SURFACE};border:1px solid ${RULE_FAINT};border-radius:4px;padding:0 5px}
.rl-ok{display:flex;align-items:center;gap:6px;color:${OK}}
.rl-seal{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1.5px solid ${OK};font-size:10px}
.rl-notice{border-left:3px solid ${WARN};padding:4px 8px;background:${SURFACE};border-radius:0 6px 6px 0}
.rl-notice[data-tone="error"]{border-left-color:${BAD}}
.rl-table-wrap{overflow-x:auto}
.rl-table{width:100%;border-collapse:collapse;font-size:13px}
.rl-table th,.rl-table td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid ${RULE}}
.rl-table thead th{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${INK3};border-bottom:1.5px solid ${INK3}}
.rl-table tbody th{font-weight:400}
.rl-exp-toggle{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.rl-caret{color:${INK3};font-size:10px}
.rl-exp-title{display:block;color:${INK2};font-size:12px;margin-top:2px}
.rl-exp-detail td{background:${SURFACE}}
.rl-exp-detail td>*+*{margin-top:6px}
.rl-kv-key{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${INK3};margin-right:4px}
.rl-runs{display:flex;flex-wrap:wrap;gap:4px 8px}
.rl-verdict{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor;color:${INK2}}
.rl-verdict[data-verdict="supported"]{color:${OK}}
.rl-verdict[data-verdict="refuted"]{color:${BAD}}
.rl-verdict[data-verdict="inconclusive"],.rl-verdict[data-verdict="exploratory"]{color:${WARN}}
.rl-verdict[data-verdict="invalid"]{color:${INK3};text-decoration:line-through}
.rl-verdict-confidence{font-weight:400;color:${INK3}}
.rl-role,.rl-evidence{font-size:12px;color:${INK2}}
.rl-evidence[data-evidence="confirmatory"]{color:${OK};font-weight:600}
.rl-evidence[data-evidence="exploratory"]{color:${WARN}}
.rl-objections{font-size:12px;color:${INK2}}
.rl-objections[data-open="true"]{color:${BAD}}
.rl-objection-status{font-size:11px;color:${INK3}}
.rl-objection-status[data-status="open"]{color:${BAD}}
.rl-outcome{font-size:12px;color:${BAD}}
.rl-outcome[data-outcome="ran"]{color:${INK2}}
.rl-decision{font-weight:600}
.rl-decision[data-decision="continue"]{color:${ACCENT}}
.rl-decision[data-decision="stop"]{color:${INK}}
.rl-writeup{border-top:1px solid ${RULE};padding-top:12px;display:flex;flex-direction:column;gap:8px}
.rl-answer{margin:0;padding:8px 12px;border-left:3px solid ${OK};background:${SUNKEN};font-family:${SERIF};font-size:15px;line-height:1.55;border-radius:0 6px 6px 0}
.rl-run-notes summary{cursor:pointer;font-size:12px;color:${INK3}}
.rl-empty{padding:28px 16px;text-align:center;background:${SURFACE};border:1px dashed ${RULE};border-radius:10px}
.rl-empty-title{margin:0 0 6px;font-family:${SERIF};font-size:16px;font-weight:600}
.rl-dock{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-sizing:border-box;width:100%;padding:6px 12px;border:1px solid ${RULE};border-radius:10px;background:${SURFACE};font-size:12px;color:${INK2}}
.rl-dock:hover{border-color:${ACCENT}}
.rl-dock-title{font-family:${SERIF};font-weight:600;color:${INK}}
.rl-dock-open{margin-left:auto;color:${ACCENT}}
.rl-dock .rl-elapsed{margin-left:0}
.rl-card{display:flex;flex-direction:column;gap:8px;padding:10px 12px;width:100%;box-sizing:border-box;border-left:3px solid ${ACCENT}}
.rl-card-title{font-family:${SERIF};font-weight:600}
.rl-card-open{margin-left:auto;font-size:12px}
.rl-card-round{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
.rl-card-round-title{color:${INK2};min-width:56px}
.rl-card-exp{display:inline-flex;align-items:center;gap:4px}
.rl-card-answer{margin:0;font-family:${SERIF};font-size:14px;color:${INK2};font-style:italic}
@media (max-width:640px){.rl-view{padding:10px}.rl-rail{margin:0}.rl-round-body{grid-template-columns:1fr}}
`

/**
 * Mount the styles until the returned disposer runs.
 * @returns disposer that removes the style element.
 */
export function injectStyles(): () => void {
  const element = document.createElement('style')
  element.dataset.researchLoopStyles = 'true'
  element.textContent = STYLES
  document.head.append(element)
  return () => { element.remove() }
}
