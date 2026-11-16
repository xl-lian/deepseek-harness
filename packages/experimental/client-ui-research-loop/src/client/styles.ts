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
/* Activity outside loops. */
.rl-activity-details > summary{cursor:pointer;list-style:revert}
.rl-activity-turn{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-top:1px solid ${RULE_FAINT}}
.rl-activity-head{display:flex;align-items:center;gap:8px;min-width:0}
.rl-activity-headline{font-family:${SERIF};font-size:14px;color:${INK};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-activity-steps{list-style:none;margin:0;padding:0 0 0 16px;display:flex;flex-direction:column;gap:3px}
.rl-activity-step{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px;color:${INK2}}
.rl-activity-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-activity-command{font-size:11px;color:${INK3};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-activity-files{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin:0;padding-left:16px;font-size:12px}
/* Campaign rounds: stage rings, stage details, member rows, and verifier results. */
.rl-dot[data-status="blocked"]{background:${BAD}}
.rl-dot[data-status="interrupted"]{background:${WARN}}
.rlc-view-details-title::before{content:"\\00a7\\2009";color:${ACCENT};font-style:normal}
.rlc-kv-row dt{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${INK3}}
.rlc-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.rlc-card{display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;box-sizing:border-box;padding:12px 14px;border:1px solid ${RULE};border-radius:8px;background:${SURFACE}}
.rlc-header{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.rlc-title{font-family:${SERIF};font-size:15px;font-weight:400}
.rlc-round-id{font-size:12px;font-style:italic;color:${INK3}}
.rlc-mode{font-size:12px;padding:0 6px;border-radius:999px;background:${SUNKEN}}
.rlc-status{font-size:12px;opacity:.85}
.rlc-running{font-size:12px;color:${ACCENT}}
.rlc-elapsed{margin-left:auto;font-size:12px;opacity:.65}
.rlc-stages{list-style:none;display:flex;align-items:flex-start;gap:0;margin:0;padding:0;overflow-x:auto}
.rlc-stage{display:flex;align-items:center;gap:0;min-width:0;flex:1 1 0}
.rlc-connector{display:block;width:12px;height:1px;background:${RULE};flex:none}
.rlc-stage-button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;flex:1 1 auto;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;cursor:pointer;text-align:left;font:inherit}
.rlc-stage-button:focus-visible{outline:1px solid ${ACCENT};outline-offset:-1px}
.rlc-stage[data-status="running"] .rlc-stage-button{border-color:${ACCENT};background:${SUNKEN}}
.rlc-stage-name{font-family:${SERIF};font-size:14px;font-weight:400;white-space:nowrap}
.rlc-stage-role{font-size:11px;font-style:italic;color:${INK3};white-space:nowrap}
.rlc-stage-count{font-size:11px;opacity:.75}
.rlc-verdict{font-size:11px;padding:0 5px;border-radius:999px;border:1px solid currentColor}
.rlc-verdict[data-verdict="pass"]{color:${OK}}
.rlc-verdict[data-verdict="warn"]{color:${WARN}}
.rlc-verdict[data-verdict="fail"]{color:${BAD}}
.rlc-details{width:100%;display:flex;flex-direction:column;gap:8px;padding:8px 6px 2px;box-sizing:border-box}
.rlc-members{list-style:none;display:flex;flex-direction:column;gap:8px;margin:0;padding:0}
.rlc-member{display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-radius:8px;background:${SUNKEN}}
.rlc-member-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px}
.rlc-member-label{font-weight:500}
.rlc-member-role,.rlc-member-status{opacity:.65}
.rlc-member-time{margin-left:auto;opacity:.55;font-variant-numeric:tabular-nums}
.rlc-member-summary{margin:0;font-size:12px;opacity:.85;white-space:pre-wrap}
.rlc-member-actions{display:flex;gap:6px;flex-wrap:wrap}
.rlc-member-actions button{font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid ${RULE};background:transparent;color:inherit;cursor:pointer}
.rlc-output summary{cursor:pointer;font-size:11px;opacity:.7}
.rlc-output pre{max-height:220px;overflow:auto;white-space:pre-wrap;font-size:11px;margin:4px 0 0}
.rlc-extra{display:flex;flex-direction:column;gap:4px;font-size:12px}
.rlc-extra p{margin:0}
.rlc-muted{opacity:.7}
.rlc-risks{margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:2px}
.rlc-expand{margin-left:8px;font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid ${RULE};background:transparent;color:inherit;cursor:pointer}
.rlc-view-hint{font-family:${SERIF};font-style:italic;font-size:14px;color:${INK3};margin:0}
.rlc-summary{display:flex;flex-direction:column;gap:1px;min-width:0;font-size:11px;line-height:1.35;opacity:.85}
.rlc-summary-line{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.rlc-node-summary{margin-top:1px;opacity:.75}
.rlc-details-summary{font-size:12px;opacity:.9;margin-bottom:2px}
.rlc-label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${INK3};margin:4px 0 2px}
.rlc-kv{margin:0;display:flex;flex-direction:column;gap:2px;font-size:12px}
.rlc-kv-row{display:flex;gap:8px;align-items:baseline}
.rlc-kv-row dt{flex:0 0 auto;opacity:.6;font-size:11px}
.rlc-kv-row dd{margin:0;min-width:0;word-break:break-word}
.rlc-plan p,.rlc-notes p{margin:0;font-size:12px;white-space:pre-wrap;word-break:break-word}
.rlc-metrics code{font-size:11px;opacity:.9}
.rlc-flags{display:flex;flex-wrap:wrap;gap:4px}
.rlc-flag{font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid currentColor}
.rlc-flag[data-kind="trust"]{opacity:.75}
.rlc-flag[data-kind="blocking"]{color:${BAD}}
.rlc-flag[data-kind="warning"]{color:${WARN}}
.rlc-checks summary{cursor:pointer;font-size:11px;opacity:.7}
.rlc-check-layer{margin-top:4px}
.rlc-check-layer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rlc-check{display:flex;align-items:baseline;gap:6px;font-size:11px}
.rlc-check code{font-size:11px}
.rlc-files{display:flex;flex-wrap:wrap;gap:4px}
.rlc-file{font:inherit;font-size:11px;padding:1px 6px;border-radius:6px;border:1px solid ${RULE};background:transparent;color:inherit;cursor:pointer}
.rlc-tag{font-size:10px;padding:0 6px;border-radius:999px;border:1px solid ${RULE};opacity:.8}
.rlc-candidates table{border-collapse:collapse;font-size:11px;margin-top:2px}
.rlc-candidates th,.rlc-candidates td{text-align:left;padding:2px 8px 2px 0;border-bottom:1px solid ${RULE}}
.rlc-candidates th{opacity:.6;font-weight:500}
.rlc-issues,.rlc-hypotheses,.rlc-evidence ul{margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:3px}
.rlc-hypotheses{list-style:none;padding-left:0}
.rlc-hypothesis{padding:4px 0;border-bottom:1px solid ${RULE}}
.rlc-hypothesis-head{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;font-size:12px}
.rlc-evidence li{display:flex;flex-direction:column;gap:1px}
.rlc-risks-block{font-size:12px}
.rlc-error{font-size:12px;color:${BAD};margin:0;white-space:pre-wrap;word-break:break-word}
.rlc-status-detail{margin:0;font-size:11px}
@keyframes rlc-glow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 3px color-mix(in srgb, ${ACCENT} 12%, transparent)}}
.rlc-exp{display:flex;flex-direction:column;gap:8px;container-type:inline-size}
.rlc-exp-title{display:flex;align-items:baseline;gap:8px;min-width:0;margin:0;font-size:13px;font-weight:400}
.rlc-exp-title code{flex:none;white-space:nowrap;font-size:12px;color:${INK3}}
.rlc-exp-statement{font-family:${SERIF};font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rlc-exp-body{display:grid;grid-template-columns:minmax(300px,480px) minmax(0,1fr);gap:16px;align-items:stretch}
.rlc-exp-detail{contain:size;overflow:auto;min-height:0;border:1px solid ${RULE};border-radius:8px;padding:14px;background:${SURFACE}}
.rlc-shared-note{margin:0 0 6px;font-size:11px;font-style:italic}
.rlc-ring{position:relative;width:100%;aspect-ratio:1;container-type:inline-size}
.rlc-ring-edges{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rlc-ring-line{fill:none;stroke:${RULE};stroke-width:1.5}
.rlc-ring-arrow{fill:${RULE}}
.rlc-ring-arc[data-flow="done"] .rlc-ring-line{stroke:${INK3}}
.rlc-ring-arc[data-flow="done"] .rlc-ring-arrow{fill:${INK3}}
.rlc-ring-arc[data-flow="flowing"] .rlc-ring-line{stroke:${ACCENT};stroke-dasharray:6 6;animation:rlc-ring-flow 1s linear infinite}
.rlc-ring-arc[data-flow="flowing"] .rlc-ring-arrow{fill:${ACCENT}}
.rlc-ring-arc[data-closing="true"] .rlc-ring-line{stroke-dasharray:3 5}
.rlc-ring-repair .rlc-ring-line{stroke:${WARN};stroke-dasharray:5 4}
.rlc-ring-repair .rlc-ring-arrow{fill:${WARN}}
.rlc-ring-repair text{fill:${WARN};font-size:12px;font-style:italic}
.rlc-ring-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34%;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;pointer-events:none}
.rlc-ring-key{font-family:${SERIF};font-size:clamp(14px,4.4cqi,20px);color:${INK};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rlc-ring-center-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${INK3}}
.rlc-ring-center-tags{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.rlc-tag[data-outcome="chosen"]{border-color:${OK};color:${OK};opacity:1}
.rlc-tag[data-outcome="eliminated"]{color:${INK3}}
.rlc-ring-nodes{list-style:none;margin:0;padding:0}
.rlc-ring-slot{position:absolute;width:23.5%;height:12.5%;transform:translate(-50%,-50%)}
.rlc-ring-node{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:4px 7px;border-radius:6px;border:1px solid ${RULE};background:${SURFACE};color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden;transition:border-color .15s ease,background-color .15s ease}
.rlc-ring-node:focus-visible{outline:1px solid ${ACCENT};outline-offset:2px}
.rlc-ring-node[data-status="pending"]{border-style:dashed}
.rlc-ring-node[data-status="running"]{border-color:${ACCENT};animation:rlc-glow 2s ease-in-out infinite}
.rlc-ring-node[data-status="failed"],.rlc-ring-node[data-status="blocked"]{border-color:${BAD}}
.rlc-ring-node[data-shared="true"]{opacity:.72}
.rlc-ring-node[aria-pressed="true"]{opacity:1;border-color:${INK3};background:${SUNKEN}}
.rlc-ring-node-head{display:flex;align-items:center;gap:4px;min-width:0}
.rlc-ring-numeral{font-size:9px;letter-spacing:.1em;color:${INK3}}
.rlc-ring-node[data-status="running"] .rlc-ring-numeral{color:${ACCENT}}
.rlc-ring-node-name{font-family:${SERIF};font-size:clamp(11px,3cqi,14px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.rlc-ring-node .rlc-verdict{margin-left:auto;font-size:9px;padding:0 4px}
.rlc-ring-node-line{font-size:clamp(9px,2.2cqi,11px);line-height:1.3;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rlc-view-details-title{margin:0 0 10px;font-family:${SERIF};font-size:17px;font-weight:400;font-style:italic}
.rlc-vr{display:flex;flex-direction:column;gap:10px;margin-bottom:6px}
.rlc-vr-attempt{display:flex;flex-direction:column;gap:6px}
.rlc-vr-chain{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:12px}
.rlc-vr-chain li{display:inline-flex;align-items:center;gap:5px}
.rlc-vr-chain li + li::before{content:"\\2192";color:${INK3}}
.rlc-vr-trust{margin:0;font-size:11px}
.rlc-vr-group .rlc-label{margin-top:2px}
.rlc-vr-group[data-result="fail"] .rlc-label{color:${BAD}}
.rlc-vr-group[data-result="warn"] .rlc-label{color:${WARN}}
.rlc-vr-group[data-result="pass"] .rlc-label{color:${OK}}
.rlc-vr-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.rlc-vr-check{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:12px;line-height:1.4}
.rlc-vr-check code{font-size:11px}
.rlc-vr-mark{flex:none;width:12px;text-align:center;font-weight:600}
.rlc-vr-check[data-status="fail"] .rlc-vr-mark{color:${BAD}}
.rlc-vr-check[data-status="warn"] .rlc-vr-mark{color:${WARN}}
.rlc-vr-check[data-status="pass"] .rlc-vr-mark{color:${OK}}
.rlc-vr-check[data-status="skip"]{opacity:.65}
.rlc-vr-layer{font-size:10px;letter-spacing:.08em;color:${INK3}}
.rlc-vr-summary{flex:1 1 220px;min-width:0;opacity:.8;word-break:break-word}
.rlc-vr-none{margin:0;font-size:12px}
.rlc-tag[data-kind="blocking"]{color:${BAD};border-color:currentColor;opacity:1}
.rlc-outcome{margin:0 0 6px;font-size:13px}
.rlc-outcome[data-outcome="chosen"]{color:${OK}}
.rlc-candidates tr[data-own="true"] td{color:${INK};font-weight:500}
@keyframes rlc-ring-flow{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){.rlc-ring-arc[data-flow="flowing"] .rlc-ring-line,.rlc-ring-node[data-status="running"]{animation:none}}
@container (max-width:860px){.rlc-exp-body{grid-template-columns:minmax(0,1fr)}.rlc-ring{max-width:480px;justify-self:center}.rlc-exp-detail{contain:none;max-height:none}}
.rlc-member-toggle{width:100%;box-sizing:border-box;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.rlc-member-toggle:focus-visible{outline:1px solid ${ACCENT};outline-offset:3px;border-radius:4px}
.rlc-member-chevron{flex:none;width:6px;height:6px;margin-right:2px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);opacity:.55;transition:transform .15s ease}
.rlc-member-toggle[aria-expanded="true"] .rlc-member-chevron{transform:rotate(45deg)}
.rlc-child{display:flex;flex-direction:column;gap:8px;margin:4px 0 2px;padding:8px 10px;border-left:2px solid ${INK3};background:${SUNKEN};border-radius:0 6px 6px 0}
.rlc-child-empty{margin:4px 0 0;font-size:12px}
.rlc-child pre{margin:2px 0 0;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.45}
.rlc-child-result[data-kind="message"] pre{font-family:inherit;font-size:12px}
.rlc-child-steps ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rlc-child-steps summary{display:flex;align-items:baseline;gap:6px;min-width:0;cursor:pointer;font-size:12px;list-style:none}
.rlc-child-steps summary::-webkit-details-marker{display:none}
.rlc-child-steps code{flex:none;font-size:11px}
.rlc-child-args{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;opacity:.6}
.rlc-child-mark{flex:none;width:12px;text-align:center}
.rlc-child-steps li[data-status="ok"] .rlc-child-mark{color:${OK}}
.rlc-child-steps li[data-status="error"] .rlc-child-mark{color:${BAD}}
.rlc-child-steps li[data-status="running"] .rlc-child-mark{color:${ACCENT}}
.rlc-child-steps details > pre,.rlc-child-steps details > p{margin:2px 0 6px 18px}
@media (max-width:640px){.rlc-stages{flex-direction:column;align-items:stretch;gap:4px}.rlc-connector{width:1px;height:8px;margin-left:12px}.rlc-stage{flex:0 0 auto;flex-direction:column;align-items:stretch}}
@media (hover:hover){.rlc-stage-button:hover{background:${SUNKEN}}.rlc-member-actions button:hover{background:${SUNKEN}}.rlc-member-toggle:hover .rlc-member-label{text-decoration:underline;text-underline-offset:2px}.rlc-expand:hover{background:${SUNKEN}}.rlc-dock:hover{background:${SUNKEN}}.rlc-ring-node:hover{background:${SUNKEN}}.rlc-file:hover{background:${SUNKEN}}}
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
