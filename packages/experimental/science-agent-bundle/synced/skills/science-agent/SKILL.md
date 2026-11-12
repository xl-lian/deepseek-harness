---
name: science-agent
description: >
  Domain-general auditable research campaigns with science-agent: predictive modeling, scored
  artifact search (packing/optimization), and equation discovery, each driven by a domain pack.
  Use this skill when the user asks to run, continue, or improve experiments in a science-agent
  workspace that is not a Kaggle competition, to set up a new domain (equation discovery, a pinned
  scorer), to run N rounds or "until target/overnight", or to ask why a campaign stopped.
  Triggers include "science agent", "campaign", "run experiments", "continue", "equation discovery",
  "symbolic regression", "pinned scorer", "跑实验", "继续实验", "接着跑", "跑到目标". For Kaggle intake and
  submissions use science-agent-kaggle; both launch the same campaign workflow.
version: 0.2.0
---

# Science-Agent Campaign Orchestrator

A **campaign** is the top-level loop: deterministic preflight, then `plan → round → close → gate`
until a stop rule fires. A **round** is one auditable experiment cycle. A **domain pack** tells both
what a run must emit and how the verifier ladder routes. Truth lives in `.sa/` and comes from
package-owned verifiers; the workflows only orchestrate.

## DeepSeek Harness runtime

You are running inside the DeepSeek Harness (dsh), not Claude Code. The runtime mapping:

- File and shell tools are `read`, `write`, `edit`, `glob`, `grep`, `bash`.
- Subagents are the preset's per-role tools: `sa_scout`, `sa_hypothesis`, `sa_engineer`,
  `sa_verifier`, `sa_statistician`, `sa_reporter`. Each gets its own persona and inherits this
  preset's tools, skills, MCP servers, and hooks. The generic `subagent` and `subagent_fork` tools
  also exist for tasks outside the science-agent roles.
- The MCP server registers `mcp__science-agent__sa_*` tools. They mirror the `sagent` CLI; pass the
  `workspace` argument explicitly when the session workspace is not the launch directory.
- The dsh `workflow` tool runs JavaScript orchestration. `agent(prompt, options)` supports `label`,
  `phase`, `schema`, `provider`, and `model`; it does not support `agentType`, `effort`, or nested
  `workflow()` calls. The bundle's saved `science-campaign` (round inlined) and `science-round`
  workflows embed each role persona in their prompts and use only the supported options.
- **Mapping rule.** Wherever a skill says `Workflow({name: "science-agent:<X>", args})`, call
  `workflow({name: "<X>", args})` with the same args minus `agentPrefix`, `useAgentTypes`,
  `roundWorkflow`, and `roundScriptPath`. The profile saves the bundle's workflows by name, so the
  script itself never enters your context.

## Non-negotiables

1. Every metric comes from `sagent` state, never from an experiment's self-report.
2. The worker never marks its own work verified. Only `sagent verify` writes verdicts.
3. Never read the sealed holdout, `.sa/private`, or `.sa/ledger` directly.
4. Never edit `.sa/ledger`, `.sa/objects`, `.sa/manifests`, the installed verifier, or a pinned scorer.
5. Never select on public leaderboard feedback. Never substitute synthetic data.
6. Never submit or reveal the holdout without a human token from `sagent approve` in a terminal.
7. Keep failed runs and negative results. Report numbers must resolve from verified state.
8. Stop, mode, outcome, and winner come from `sagent` (`campaign check`, `round close`, `decide`).
   Do not override them with a narrative.

## Domain packs

```bash
sagent domain list --json
sagent -w <ws> domain show --json      # the pack the workspace objective resolves to
```

| Pack | Task types | Run contract | L2 | L5 |
|---|---|---|---|---|
| `predictive` | classification, regression, tabular, timeseries, cv, nlp, llm | metrics, OOF, folds, cv_design | built-in metric table | sealed labels |
| `scored` | packing, optimization | metrics.json + submission.csv | pinned workspace scorer | none |
| `equation` | equation, symbolic_regression | metrics.json + submission.csv (`id,expression`) | pinned scorer | sealed rows via scorer |

The objective picks a pack with `problem.domain`; without it, `task_type: packing` → `scored`,
everything else → `predictive`. `evaluation:` is accepted as a domain-neutral alias of `competition:`.

## Intake

1. `sagent init --workspace <dir> --type <task_type> --json`
2. Write the objective. Templates: `examples/objective.playground.yaml` (predictive),
   `examples/objective.packing.yaml` (scored), `examples/objective.equation.yaml` (equation).
   For a pinned scorer, copy it into the workspace (`examples/equation/scorer.py` → `tools/scorer.py`),
   put its `shasum -a 256` in `metric.recompute_sha256`, then:
   `sagent objective create --file objective.yaml --json && sagent objective lock --json`
3. Data: put inputs in `data/raw/`, then `sagent data freeze --json`; for sealed-holdout packs
   `sagent holdout create --strategy auto --frac 0.2 --seed 42 --json`.
4. `sagent env init --profile <pack env_profile> --json`

Stop at the first failing step and name the exact missing command.

## Campaign (default for "run / continue / improve")

An experiment request is a campaign, not a plan. Start it in the same turn:

```text
Workflow({
  name: "science-agent:science-campaign",
  args: {
    workspace: "<absolute workspace>",
    saBin: "sagent",
    maxRounds: <optional; defaults to objective.budget.max_rounds>,
    controller: "tree",
    roundArgs: {
      maxHypotheses: 3,
      maxRuns: <objective.budget.max_runs_per_round>,
      runTimeoutSec: <60 * objective.budget.max_wall_clock_min_per_run>,
      templatesDir: "<absolute path from `sagent templates-path --json`>",
      bankReport: "python3 tools/bank_report.py --json"   // scored pack only, optional
    }
  }
})
```

If the name is not registered, use `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/science-campaign.js"`
and pass `roundScriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/science-round.js"` in args.

What the campaign does (all control decisions are `sagent` JSON):

| Step | Command (via the `sa-clerk` agent) | Decides |
|---|---|---|
| Preflight | `doctor`, `campaign begin`, `domain show`, `campaign check` | blocked? already stopped? |
| Plan | `round begin --mode <next_mode> --campaign <id>` | mode: quick (no baseline), debug (failures), full |
| Round | nested `science-round` workflow | candidates, runs, verdicts (evidence only) |
| Close | `round close <id> --tokens-out N` | decision, claims, strict report, stages, outcome, stop rules |
| Wrap-up | `campaign end`, read-only `sa-reporter` summary | — |

Stop rules (`sagent campaign check`): `target_metric`, `max_rounds`, `no_improvement_rounds`,
`consecutive_failed_rounds`, `consecutive_blocked_rounds`, `deadline`, `max_usd`, plus `ledger_tampered` / `objective_not_locked`
(blocking). Report which rule fired.

## Single round

```bash
sagent -w <ws> round begin --mode <quick|full|debug> --controller tree --json
```

Then `Workflow({name: "science-agent:science-round", args: {workspace, roundId, mode, saBin, templatesDir, ...}})`
and afterwards exactly one deterministic close:

```bash
sagent -w <ws> round close <round_id> --json
```

Round graph: scout → hypothesis lenses (3 in full, 1 in quick, a debug proposer in debug) →
select (`hypothesis register --select`: code ranks the pool, the rest become backlog) → per-candidate
engineer → verifier (`verify runs`, one `--rerun` when code flags it suspicious) → at most one repair as
a child run → re-verify. Packs with several seeds screen every candidate on one seed, `round promote`
picks the best, and `run confirm` runs its remaining seeds. An L3 statistician runs only on an anomaly.

If the Workflow tool is unavailable, say so and run a quick round by hand; never fake fan-out.

## Reading results

- `sagent campaign check --json`: stop rules, next mode, controller actions, compact briefing.
- `sagent round status --round <id> --json`: stages and outcome.
- `sagent state briefing --json`, `sagent search curve --json`, `sagent claim audit --json`.

## Reporting to the user

1. What ran: campaign id, domain, rounds with mode and outcome.
2. Best verified result with seeds and trust, vs baseline.
3. Failures, negative results, dropped candidates.
4. Uncertainty: warnings, single seeds, holdout not revealed, disputed claims.
5. Cost: wall/CPU and recorded token cost; "not recorded" if missing.
6. Why it stopped (the fired rule) and the next action.
7. Report paths.
