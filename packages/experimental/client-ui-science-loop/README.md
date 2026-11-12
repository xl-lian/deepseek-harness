# @deepseek-ai/dsh-experimental-client-ui-science-loop

Live loop view and Kaggle Arena skin for Sessions that run the [science-agent bundle](../science-agent-bundle/README.md).

## Use this package

The [science-agent bundle](../science-agent-bundle/README.md) mounts this plugin as the `science-loop-ui` row; it is not mounted on its own.

- **Host half** (`src/index.ts`): registers the `scienceAgentLoop` session projection, a pure fold over the durable Session log. It maps `tool-workflow/*` events, direct `sa_*` subagent calls, and `sagent` CLI and MCP calls into rounds with seven stages: Scout, Hypotheses, Engineer, Verifier, Statistician, Decide, Report.
- **Client half** (`src/client/index.ts`): renders one projection in four places: a Loop view tab beside Chat and Trajectory, a dock above the composer that shows the active round and hides once the round settles, a keyed Chat card at each round anchor, and a large right-sidebar tab opened from the Expand control.

Each stage card carries a short summary (scout profile, hypotheses, the engineer's plan and metrics, verifier verdicts and trust, statistician review, decision, report). The detail panel shows the structured result: plan, files, metrics, L0–L4 checks, trust, blocking failures, decision candidates, and report issues, with links to `runs/<runId>/verdict.json` and `logs/stdout.log`.

With no structured round, the Loop tab states whether the Session runs the science preset and whether a science skill was loaded; it never invents a round.

## Skin and brand

The client half also turns the profile into **Kaggle Arena**:

- a theme override layer (`src/client/theme.ts`, `ctx.theme.overrideTokens` source `science-agent-kaggle`): one near-black surface for page and sidebar, neutral labels, serif markdown headings, and a sage accent (`#8fc7a4`) for brand, focus, primary, send, and running state. The stored theme preference is unchanged;
- loop surface styles (`src/client/styles.ts`): serif display type, roman stage numerals, italic roles, and a faint paper grain. The serif stack prefers Anthropic Serif when installed and falls back to Iowan Old Style and Songti SC;
- brand slots (`src/client/brand.tsx`): `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` at priority −1, which shadows the official brand at priority 0;
- a `· Kaggle Arena` document title suffix and a replacement favicon.

Standalone artwork lives in `assets/`.

## Model Experience

None. The plugin reads committed Session events and adds no model-visible input, tool, or prompt text, so it has no token or KV-cache effect.

## Known Limitations and Deferred Work

- Orchestrator steps are inferred from logged tool calls. Commands run outside the model's tools, and scripts that expose no structured `sagent`, MCP, direct-role, or science workflow call, are not visible.
- Decide and Report have no explicit start event; the `sagent decide` / `sagent report` call is the start, and an unobserved stage stays pending.
- The fold reads only the Session log; it does not tail `.sa/ledger` or poll `.sa/state.json`.
- `src/shared/classify.ts` hard-codes the science-agent workflow names, `sa_*` tool names, `sagent` subcommands, and workflow result fields. A science-agent change to any of them needs a matching change here; the bundle's sync check fails when the workflow result fields it guards disappear.
- UI copy has English and Chinese dictionaries only, the package has no locale metadata, icon, or DETAIL page, and coverage, export JSDoc, and client i18n gates are not yet met.
