/**
 * Scoped styles for the loop surfaces, using the web client's alias tokens with
 * neutral fallbacks, in the Kaggle Arena night-manuscript style: serif display
 * type, roman stage numerals, and a faint paper grain. Completed work stays
 * neutral; the sage accent marks only running state and keyboard focus, and
 * state colors mark verdicts and failures.
 */

const STYLES = `
html{color-scheme:dark}
.sal-view-details-title::before{content:"\\00a7\\2009";color:var(--dsw-alias-state-business-primary,#8fc7a4);font-style:normal}
.sal-kv-row dt{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#9c9891)}
:root{--sal-serif:"Anthropic Serif","Iowan Old Style","Palatino Linotype",Palatino,"Songti SC","Source Han Serif SC","Noto Serif CJK SC",Georgia,serif}
[class*="_headline"] [class*="_titleGroup"]{font-family:var(--sal-serif);font-style:italic;font-weight:400;letter-spacing:-.01em}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:2147483646;opacity:.05;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.sal-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
::selection{background:rgba(143,199,164,.3);color:inherit}
.ka-wordmark{display:inline-flex;align-items:baseline;gap:5px;font-family:var(--sal-serif);font-size:17px;font-weight:400;letter-spacing:0;line-height:1;white-space:nowrap}
.ka-wordmark-main{color:var(--dsw-alias-label-primary,#ecebe6)}
.ka-wordmark-accent{color:var(--dsw-alias-brand-primary,#8fc7a4);font-style:italic}
.ka-hero-mark{display:inline-flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 20px rgba(143,199,164,.14))}
.sal-card{display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;box-sizing:border-box;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);border-radius:8px;background:var(--dsw-alias-bg-module-platform,#1c1c1c)}
.sal-header{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.sal-title{font-family:var(--sal-serif);font-size:15px;font-weight:400}
.sal-round-id{font-size:12px;font-style:italic;color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-mode{font-size:12px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#252525)}
.sal-status{font-size:12px;opacity:.85}
.sal-running{font-size:12px;color:var(--dsw-alias-state-business-primary,#8fc7a4)}
.sal-elapsed{margin-left:auto;font-size:12px;opacity:.65}
.sal-stages{list-style:none;display:flex;align-items:flex-start;gap:0;margin:0;padding:0;overflow-x:auto}
.sal-stage{display:flex;align-items:center;gap:0;min-width:0;flex:1 1 0}
.sal-connector{display:block;width:12px;height:1px;background:var(--dsw-alias-border-l2,#2b2b2b);flex:none}
.sal-stage-button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;flex:1 1 auto;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;cursor:pointer;text-align:left;font:inherit}
.sal-stage-button:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary,#8fc7a4);outline-offset:-1px}
.sal-stage[data-status="running"] .sal-stage-button{border-color:var(--dsw-alias-state-business-primary,#8fc7a4);background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}
.sal-stage-name{font-family:var(--sal-serif);font-size:14px;font-weight:400;white-space:nowrap}
.sal-stage-role{font-size:11px;font-style:italic;color:var(--dsw-alias-label-tertiary,#9c9891);white-space:nowrap}
.sal-stage-count{font-size:11px;opacity:.75}
.sal-verdict{font-size:11px;padding:0 5px;border-radius:999px;border:1px solid currentColor}
.sal-verdict[data-verdict="pass"]{color:var(--dsw-alias-state-success-primary,#8fc7a4)}
.sal-verdict[data-verdict="warn"]{color:var(--dsw-alias-state-warn-primary,#f2b53d)}
.sal-verdict[data-verdict="fail"]{color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#9c9891);flex:none;display:inline-block}
.sal-dot[data-status="running"]{background:var(--dsw-alias-state-business-primary,#8fc7a4);animation:sal-pulse 1.4s ease-in-out infinite}
.sal-dot[data-status="completed"]{background:var(--dsw-alias-state-success-primary,#8fc7a4)}
.sal-dot[data-status="failed"],.sal-dot[data-status="blocked"]{background:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-dot[data-status="cancelled"],.sal-dot[data-status="interrupted"]{background:var(--dsw-alias-state-warn-primary,#f2b53d)}
@keyframes sal-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.sal-details{width:100%;display:flex;flex-direction:column;gap:8px;padding:8px 6px 2px;box-sizing:border-box}
.sal-empty{font-family:var(--sal-serif);font-style:italic;font-size:13px;color:var(--dsw-alias-label-tertiary,#9c9891);margin:0}
.sal-members{list-style:none;display:flex;flex-direction:column;gap:8px;margin:0;padding:0}
.sal-member{display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,#252525)}
.sal-member-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px}
.sal-member-label{font-weight:500}
.sal-member-role,.sal-member-status{opacity:.65}
.sal-member-time{margin-left:auto;opacity:.55;font-variant-numeric:tabular-nums}
.sal-member-summary{margin:0;font-size:12px;opacity:.85;white-space:pre-wrap}
.sal-member-actions{display:flex;gap:6px;flex-wrap:wrap}
.sal-member-actions button{font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);background:transparent;color:inherit;cursor:pointer}
.sal-output summary{cursor:pointer;font-size:11px;opacity:.7}
.sal-output pre{max-height:220px;overflow:auto;white-space:pre-wrap;font-size:11px;margin:4px 0 0}
.sal-extra{display:flex;flex-direction:column;gap:4px;font-size:12px}
.sal-extra p{margin:0}
.sal-muted{opacity:.7}
.sal-risks{margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:2px}
.sal-expand{margin-left:8px;font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);background:transparent;color:inherit;cursor:pointer}
.sal-dock{display:flex;align-items:center;gap:8px;width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:12px;padding:7px 12px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);border-radius:8px;background:var(--dsw-alias-bg-module-platform,#1c1c1c);color:inherit;cursor:pointer;text-align:left}
.sal-dock:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary,#8fc7a4);outline-offset:-1px}
.sal-dock-title{font-family:var(--sal-serif);font-size:14px;font-weight:400;white-space:nowrap}
.sal-dock-stages{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;flex:1 1 auto}
.sal-dock-stage{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;opacity:.7}
.sal-dock-stage[data-status="running"]{opacity:1;color:var(--dsw-alias-state-business-primary,#8fc7a4)}
.sal-dock-stage[data-status="completed"]{opacity:.85}
.sal-dock-stage[data-status="failed"],.sal-dock-stage[data-status="blocked"]{opacity:1;color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-dock-open{font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);white-space:nowrap}
.sal-view{container-type:inline-size;display:flex;flex-direction:column;gap:14px;padding:18px 22px 28px;box-sizing:border-box;min-height:100%}
.sal-view-header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l2,#2b2b2b)}
.sal-view-title{font-family:var(--sal-serif);font-size:21px;font-weight:400;letter-spacing:-.005em}
.sal-view-hint{font-family:var(--sal-serif);font-style:italic;font-size:14px;color:var(--dsw-alias-label-tertiary,#9c9891);margin:0}
.sal-view-empty{font-family:var(--sal-serif);font-style:italic;font-size:15px;color:var(--dsw-alias-label-tertiary,#9c9891);padding:24px}
.sal-empty{display:flex;flex-direction:column;gap:8px;max-width:620px;padding:28px 24px;box-sizing:border-box}
.sal-empty-title{margin:0;font-family:var(--sal-serif);font-size:20px;font-weight:400;line-height:1.25;color:var(--dsw-alias-label-primary,#ecebe6)}
.sal-empty-body{margin:0;font-family:var(--sal-serif);font-size:14px;line-height:1.55;color:var(--dsw-alias-label-secondary,#b8b4ad)}
.sal-empty-command{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-empty-command code{padding:2px 7px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);border-radius:5px;background:var(--dsw-alias-bg-layer-2,#202020);color:var(--dsw-alias-label-primary,#ecebe6);font-size:11px}
.sal-empty[data-compact="true"]{gap:6px;padding:16px}
.sal-empty[data-compact="true"] .sal-empty-title{font-size:16px}
.sal-empty[data-compact="true"] .sal-empty-body{font-size:13px}
.sal-summary{display:flex;flex-direction:column;gap:1px;min-width:0;font-size:11px;line-height:1.35;opacity:.85}
.sal-summary-line{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.sal-node-summary{margin-top:1px;opacity:.75}
.sal-details-summary{font-size:12px;opacity:.9;margin-bottom:2px}
.sal-label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#9c9891);margin:4px 0 2px}
.sal-kv{margin:0;display:flex;flex-direction:column;gap:2px;font-size:12px}
.sal-kv-row{display:flex;gap:8px;align-items:baseline}
.sal-kv-row dt{flex:0 0 auto;opacity:.6;font-size:11px}
.sal-kv-row dd{margin:0;min-width:0;word-break:break-word}
.sal-plan p,.sal-notes p{margin:0;font-size:12px;white-space:pre-wrap;word-break:break-word}
.sal-metrics code{font-size:11px;opacity:.9}
.sal-flags{display:flex;flex-wrap:wrap;gap:4px}
.sal-flag{font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid currentColor}
.sal-flag[data-kind="trust"]{opacity:.75}
.sal-flag[data-kind="blocking"]{color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-flag[data-kind="warning"]{color:var(--dsw-alias-state-warn-primary,#f2b53d)}
.sal-checks summary{cursor:pointer;font-size:11px;opacity:.7}
.sal-check-layer{margin-top:4px}
.sal-check-layer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.sal-check{display:flex;align-items:baseline;gap:6px;font-size:11px}
.sal-check code{font-size:11px}
.sal-files{display:flex;flex-wrap:wrap;gap:4px}
.sal-file{font:inherit;font-size:11px;padding:1px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);background:transparent;color:inherit;cursor:pointer}
.sal-tag{font-size:10px;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);opacity:.8}
.sal-candidates table{border-collapse:collapse;font-size:11px;margin-top:2px}
.sal-candidates th,.sal-candidates td{text-align:left;padding:2px 8px 2px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#2b2b2b)}
.sal-candidates th{opacity:.6;font-weight:500}
.sal-issues,.sal-hypotheses,.sal-evidence ul{margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:3px}
.sal-hypotheses{list-style:none;padding-left:0}
.sal-hypothesis{padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#2b2b2b)}
.sal-hypothesis-head{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;font-size:12px}
.sal-evidence li{display:flex;flex-direction:column;gap:1px}
.sal-risks-block{font-size:12px}
.sal-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#ef5350);margin:0;white-space:pre-wrap;word-break:break-word}
.sal-status-detail{margin:0;font-size:11px}
@keyframes sal-glow{0%,100%{box-shadow:0 0 0 0 rgba(143,199,164,0)}50%{box-shadow:0 0 0 3px rgba(143,199,164,.12)}}
@media (max-width:640px){.sal-dock-stages{display:none}}
.sal-round-chip[aria-current="true"]{border-color:var(--dsw-alias-border-l4,#404040);color:var(--dsw-alias-label-primary,#ecebe6)}
.sal-round{display:flex;flex-direction:column;gap:12px;scroll-margin-top:12px;content-visibility:auto;contain-intrinsic-size:auto 640px}
.sal-round + .sal-round{padding-top:18px;border-top:1px solid var(--dsw-alias-border-l2,#2b2b2b)}
.sal-round-header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.sal-round-title{margin:0;font-family:var(--sal-serif);font-size:18px;font-weight:400;font-style:italic}
.sal-exp{display:flex;flex-direction:column;gap:8px;container-type:inline-size}
.sal-exp-title{display:flex;align-items:baseline;gap:8px;min-width:0;margin:0;font-size:13px;font-weight:400}
.sal-exp-title code{flex:none;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-exp-statement{font-family:var(--sal-serif);font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sal-exp-body{display:grid;grid-template-columns:minmax(300px,480px) minmax(0,1fr);gap:16px;align-items:stretch}
.sal-exp-detail{contain:size;overflow:auto;min-height:0;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);border-radius:8px;padding:14px;background:var(--dsw-alias-bg-module-platform,#1c1c1c)}
.sal-shared-note{margin:0 0 6px;font-size:11px;font-style:italic}
.sal-ring{position:relative;width:100%;aspect-ratio:1;container-type:inline-size}
.sal-ring-edges{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.sal-ring-line{fill:none;stroke:var(--dsw-alias-border-l2,#2b2b2b);stroke-width:1.5}
.sal-ring-arrow{fill:var(--dsw-alias-border-l2,#2b2b2b)}
.sal-ring-arc[data-flow="done"] .sal-ring-line{stroke:var(--dsw-alias-border-l4,#404040)}
.sal-ring-arc[data-flow="done"] .sal-ring-arrow{fill:var(--dsw-alias-border-l4,#404040)}
.sal-ring-arc[data-flow="flowing"] .sal-ring-line{stroke:var(--dsw-alias-state-business-primary,#8fc7a4);stroke-dasharray:6 6;animation:sal-ring-flow 1s linear infinite}
.sal-ring-arc[data-flow="flowing"] .sal-ring-arrow{fill:var(--dsw-alias-state-business-primary,#8fc7a4)}
.sal-ring-arc[data-closing="true"] .sal-ring-line{stroke-dasharray:3 5}
.sal-ring-repair .sal-ring-line{stroke:var(--dsw-alias-state-warn-primary,#f2b53d);stroke-dasharray:5 4}
.sal-ring-repair .sal-ring-arrow{fill:var(--dsw-alias-state-warn-primary,#f2b53d)}
.sal-ring-repair text{fill:var(--dsw-alias-state-warn-primary,#f2b53d);font-size:12px;font-style:italic}
.sal-ring-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34%;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;pointer-events:none}
.sal-ring-key{font-family:var(--sal-serif);font-size:clamp(14px,4.4cqi,20px);color:var(--dsw-alias-label-primary,#ecebe6);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sal-ring-center-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-ring-center-tags{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.sal-tag[data-outcome="chosen"]{border-color:var(--dsw-alias-state-success-primary,#8fc7a4);color:var(--dsw-alias-state-success-primary,#8fc7a4);opacity:1}
.sal-tag[data-outcome="eliminated"]{color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-ring-nodes{list-style:none;margin:0;padding:0}
.sal-ring-slot{position:absolute;width:23.5%;height:12.5%;transform:translate(-50%,-50%)}
.sal-ring-node{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:4px 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);background:var(--dsw-alias-bg-module-platform,#1c1c1c);color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden;transition:border-color .15s ease,background-color .15s ease}
.sal-ring-node:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary,#8fc7a4);outline-offset:2px}
.sal-ring-node[data-status="pending"]{border-style:dashed}
.sal-ring-node[data-status="running"]{border-color:var(--dsw-alias-state-business-primary,#8fc7a4);animation:sal-glow 2s ease-in-out infinite}
.sal-ring-node[data-status="failed"],.sal-ring-node[data-status="blocked"]{border-color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-ring-node[data-shared="true"]{opacity:.72}
.sal-ring-node[aria-pressed="true"]{opacity:1;border-color:var(--dsw-alias-label-tertiary,#9c9891);background:var(--dsw-alias-bg-layer-3,#252525)}
.sal-ring-node-head{display:flex;align-items:center;gap:4px;min-width:0}
.sal-ring-numeral{font-size:9px;letter-spacing:.1em;color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-ring-node[data-status="running"] .sal-ring-numeral{color:var(--dsw-alias-state-business-primary,#8fc7a4)}
.sal-ring-node-name{font-family:var(--sal-serif);font-size:clamp(11px,3cqi,14px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.sal-ring-node .sal-verdict{margin-left:auto;font-size:9px;padding:0 4px}
.sal-ring-node-line{font-size:clamp(9px,2.2cqi,11px);line-height:1.3;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sal-view-details-title{margin:0 0 10px;font-family:var(--sal-serif);font-size:17px;font-weight:400;font-style:italic}
.sal-vr{display:flex;flex-direction:column;gap:10px;margin-bottom:6px}
.sal-vr-attempt{display:flex;flex-direction:column;gap:6px}
.sal-vr-chain{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:12px}
.sal-vr-chain li{display:inline-flex;align-items:center;gap:5px}
.sal-vr-chain li + li::before{content:"\\2192";color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-vr-trust{margin:0;font-size:11px}
.sal-vr-group .sal-label{margin-top:2px}
.sal-vr-group[data-result="fail"] .sal-label{color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-vr-group[data-result="warn"] .sal-label{color:var(--dsw-alias-state-warn-primary,#f2b53d)}
.sal-vr-group[data-result="pass"] .sal-label{color:var(--dsw-alias-state-success-primary,#8fc7a4)}
.sal-vr-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.sal-vr-check{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:12px;line-height:1.4}
.sal-vr-check code{font-size:11px}
.sal-vr-mark{flex:none;width:12px;text-align:center;font-weight:600}
.sal-vr-check[data-status="fail"] .sal-vr-mark{color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-vr-check[data-status="warn"] .sal-vr-mark{color:var(--dsw-alias-state-warn-primary,#f2b53d)}
.sal-vr-check[data-status="pass"] .sal-vr-mark{color:var(--dsw-alias-state-success-primary,#8fc7a4)}
.sal-vr-check[data-status="skip"]{opacity:.65}
.sal-vr-layer{font-size:10px;letter-spacing:.08em;color:var(--dsw-alias-label-tertiary,#9c9891)}
.sal-vr-summary{flex:1 1 220px;min-width:0;opacity:.8;word-break:break-word}
.sal-vr-none{margin:0;font-size:12px}
.sal-tag[data-kind="blocking"]{color:var(--dsw-alias-state-error-primary,#ef5350);border-color:currentColor;opacity:1}
.sal-outcome{margin:0 0 6px;font-size:13px}
.sal-outcome[data-outcome="chosen"]{color:var(--dsw-alias-state-success-primary,#8fc7a4)}
.sal-candidates tr[data-own="true"] td{color:var(--dsw-alias-label-primary,#ecebe6);font-weight:500}
@keyframes sal-ring-flow{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){.sal-ring-arc[data-flow="flowing"] .sal-ring-line,.sal-ring-node[data-status="running"]{animation:none}}
@container (max-width:860px){.sal-exp-body{grid-template-columns:minmax(0,1fr)}.sal-ring{max-width:480px;justify-self:center}.sal-exp-detail{contain:none;max-height:none}}
.sal-member-toggle{width:100%;box-sizing:border-box;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.sal-member-toggle:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary,#8fc7a4);outline-offset:3px;border-radius:4px}
.sal-member-chevron{flex:none;width:6px;height:6px;margin-right:2px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);opacity:.55;transition:transform .15s ease}
.sal-member-toggle[aria-expanded="true"] .sal-member-chevron{transform:rotate(45deg)}
.sal-child{display:flex;flex-direction:column;gap:8px;margin:4px 0 2px;padding:8px 10px;border-left:2px solid var(--dsw-alias-border-l4,#404040);background:var(--dsw-alias-bg-layer-2,#202020);border-radius:0 6px 6px 0}
.sal-child-empty{margin:4px 0 0;font-size:12px}
.sal-child pre{margin:2px 0 0;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.45}
.sal-child-result[data-kind="message"] pre{font-family:inherit;font-size:12px}
.sal-child-steps ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.sal-child-steps summary{display:flex;align-items:baseline;gap:6px;min-width:0;cursor:pointer;font-size:12px;list-style:none}
.sal-child-steps summary::-webkit-details-marker{display:none}
.sal-child-steps code{flex:none;font-size:11px}
.sal-child-args{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;opacity:.6}
.sal-child-mark{flex:none;width:12px;text-align:center}
.sal-child-steps li[data-status="ok"] .sal-child-mark{color:var(--dsw-alias-state-success-primary,#8fc7a4)}
.sal-child-steps li[data-status="error"] .sal-child-mark{color:var(--dsw-alias-state-error-primary,#ef5350)}
.sal-child-steps li[data-status="running"] .sal-child-mark{color:var(--dsw-alias-state-business-primary,#8fc7a4)}
.sal-child-steps details > pre,.sal-child-steps details > p{margin:2px 0 6px 18px}
.sal-large{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;box-sizing:border-box;padding:12px}
.sal-large-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sal-large-empty{font-size:12px;opacity:.65;padding:16px}
.sal-rounds{display:flex;gap:6px;flex-wrap:wrap}
.sal-round-chip{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#2b2b2b);background:transparent;color:inherit;cursor:pointer}
.sal-round-chip[aria-pressed="true"]{border-color:var(--dsw-alias-border-l4,#404040);background:var(--dsw-alias-bg-layer-3,#252525);color:var(--dsw-alias-label-primary,#ecebe6)}
.sal-large-stages{list-style:none;display:flex;flex-direction:column;gap:4px;margin:0;padding:0}
.sal-large-stage{display:flex;flex-direction:column;gap:4px}
.sal-large-stage > .sal-connector{width:1px;height:10px;margin-left:16px;background:var(--dsw-alias-border-l2,#2b2b2b)}
.sal-large-stage > .sal-stage-button{flex:0 0 auto;width:100%;border:1px solid transparent}
.sal-large-stage[data-status="running"] > .sal-stage-button{border-color:var(--dsw-alias-state-business-primary,#8fc7a4);background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}
@media (max-width:640px){.sal-stages{flex-direction:column;align-items:stretch;gap:4px}.sal-connector{width:1px;height:8px;margin-left:12px}.sal-stage{flex:0 0 auto;flex-direction:column;align-items:stretch}}
@media (prefers-reduced-motion:reduce){.sal-dot[data-status="running"]{animation:none}}
@media (hover:hover){.sal-stage-button:hover{background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}.sal-member-actions button:hover{background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}.sal-member-toggle:hover .sal-member-label{text-decoration:underline;text-underline-offset:2px}.sal-expand:hover{background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}.sal-dock:hover{background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}.sal-ring-node:hover{background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}.sal-file:hover{background:var(--dsw-alias-interactive-bg-hover,#1f1f1f)}}
`

let mounted: HTMLStyleElement | undefined

/** Append the card styles once; returns the disposer for the owning fiber. */
export function injectStyles(): () => void {
  if (mounted === undefined) {
    const element = document.createElement('style')
    element.dataset.scienceLoopStyles = 'true'
    element.textContent = STYLES
    document.head.append(element)
    mounted = element
  }
  const element = mounted
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    element.remove()
    if (mounted === element) mounted = undefined
  }
}
