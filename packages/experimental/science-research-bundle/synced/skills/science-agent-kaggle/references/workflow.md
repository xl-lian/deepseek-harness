# Workflow

Orchestration is two Claude Code Workflow scripts over the `sagent` environment, not a Python agent
framework:

| Tier | Script | `meta.name` | Owns |
|---|---|---|---|
| Campaign | `plugin/workflows/science-campaign.js` | `science-campaign` | the loop: preflight, round begin, round close, stop rules, wrap-up |
| Round | `plugin/workflows/science-round.js` | `science-round` | one round of evidence: scout, hypotheses, selection, runs, verdicts, L3 |
| Alias | `plugin/workflows/kaggle-round.js` | `kaggle-round` | forwards its args to `science-round` (older skills/commands) |

Both scripts are domain-general. What a run must emit, which templates exist, which lenses propose
hypotheses, and how the verifier routes are read from the objective's **domain pack**
(`sagent domain show --json`; `src/science_agent/domains/*.json`).

The scripts use no filesystem, wall clock, or randomness APIs. IDs, timestamps, and every control
decision come from `sagent`. State access inside a workflow goes through the `sa-clerk` agent
(low effort, Bash only), which runs exactly one named `sagent` command and returns its JSON envelope.

## 1. Campaign graph

```text
Preflight   clerk: doctor -> campaign begin -> domain show -> campaign check
              | blocked / stop already fired -> campaign end, return
              v
  ┌──────── Plan    clerk: round begin --mode <check.next_mode> --campaign <id>
  │           v
  │         Round   workflow('science-round', {pack, briefing, nextActions, mode, roundId, ...})
  │           v
  │         Close   clerk: round close <id> --tokens-out <round.tokenDelta>
  │           |       = decide -> claim sync -> report build -> strict check -> verify design
  │           |         -> stage marks -> outcome -> cost record -> round end -> campaign check
  │           v
  └── no ── Gate    stop? (from round close's campaign check) / token budget below one round
              | yes
              v
Wrap-up     clerk: campaign end; sa-reporter: read-only summary from briefing + curve
```

- **Mode** is `campaign check`'s `next_mode`: `quick` when no baseline run exists, `debug` when the
  controller says debug, the last round failed, or >70% of the last 10 runs failed execution or
  verification, else `full`.
- **Strategy** is `campaign check`'s `next_strategy`: `exploit` normally; after `no_improvement_rounds` flat rounds it
  is `explore` for `stop.explore_rounds` more rounds (default the same number), in which half the slots draft idea
  families not tried yet. `no_improvement_rounds` fires only when the explore rounds are spent and still flat.
- **Slots and budget**: the check returns `next_actions.slots` (typed work from `search next --batch 8`) and
  `round_budget` (the objective's `max_runs_per_round` and run timeout), which the campaign passes to each round.
- **Stop rules** (all code): `target_metric`, `max_rounds`, `no_improvement_rounds`,
  `consecutive_failed_rounds`, `consecutive_blocked_rounds`, `deadline`, `max_usd`; blocking `ledger_tampered`,
  `objective_not_locked`.
- **Outcome** (`round close`): `improved` iff the chosen candidate beats the best verified value from
  earlier rounds by more than `constraints.min_delta` (or is the first verified result) and has enough
  distinct seeds; `no_change`; `failed` (runs but no verified candidate); `blocked` (no runs).
- The domain pack is fetched once in preflight and passed to every round.
- The campaign never submits, approves, or reveals the holdout.

## 2. Round graph

```text
Scout (sa-scout; status gate)                     prior state from args.briefing / state briefing
   v
Hypotheses
   full : one sa-hypothesis per pack lens, in parallel     (barrier: dedupe needs all lenses)
   quick: lens 0 only, exactly one candidate
   debug: one proposer reads the failing run's logs and proposes one fix
   v
Select   full mode, several seeds: C = max(1, floor(maxRuns / (2 * seeds))) confirmation slots and
                                  S = min(maxScreen=4, maxRuns - C * (seeds - 1)) one-seed screens
         full mode, one seed:     min(maxHypotheses, floor(maxRuns / seeds)); quick/debug: 1
         clerk: hypothesis register --round <id> --select <K> --file -
         code ranks expected gain x lens calibration / cost, leakage risk, frontier parent, and
         similarity to tested ideas; at least one per lens, one candidate per independent variable;
         the rest are stored as deferred (backlog) and repeats of a tested idea as abandoned
   v
Per-candidate pipeline (no barrier between candidates)
   engineer (from parent_run_id's code when given, else a pack template) -> sagent run execute
   -> verifier: verify runs (L0-L3; verdict, repairable, suspicious come from code; one --rerun when
      the gain is >3x predicted or the metric is at its bound)
   -> at most one repair in total, as a child run, if repairable -> re-verify
   v   (barrier, only when screening: every candidate has its one-seed verdict)
clerk: round promote <id> --slots C   (paired with the reference on the screening seed)
Per-promoted pipeline: run confirm (remaining seeds, same code) -> verify runs
   v
L3 statistician: only on an anomaly (suspicious set, duplicate predictions, uncommon warning); soft
signal; its notes are stored at round close and reach the next round through lessons
   v
Return evidence + tokenDelta (this round's share of the turn's token pool)
```

Hypotheses carry `parent_run_id` (the tree controller's node) and `novelty_vs_prior`; the engineer
starts from the parent run's code snapshot and passes `--parent-run`, so search is an actual tree.

## 3. Agents and permissions

All agents declare `model: inherit`. None has the Task or Workflow tool.

| Agent | Tools | Responsibility | Cannot |
|---|---|---|---|
| `sa-clerk` | Bash | Run one named `sagent` command; return its JSON verbatim. | Choose, interpret, edit files, submit. |
| `sa-scout` | Read, Glob, Grep, Bash | Profile data/metric/risks, report prior state. | Write files, run experiments. |
| `sa-hypothesis` | Read, Glob, Grep, Bash | Propose falsifiable candidates from one lens (or one debug fix). | Execute code, edit files. |
| `sa-engineer` | Read, Write, Edit, Glob, Grep, Bash | Implement one candidate, run it, repair one L0/L1 failure as a child run. | Verify its own work, submit, edit `.sa/`. |
| `sa-verifier` | Read, Glob, Grep, Bash | Run L0–L3, read verdicts, rerun suspicious results, judge repairability. | Edit code or artifacts. |
| `sa-statistician` | Read, Glob, Grep, Bash | Select candidates under budget; round-level L3 interpretation. | Override `sagent verify`/`decide`. |
| `sa-reporter` | Read, Glob, Grep, Bash | Campaign summary from CLI JSON only. | Invent numbers, edit the ledger. |

## 4. Arguments

### 4.1 `science-campaign`

| Argument | Default | Meaning |
|---|---|---|
| `workspace` | required | Absolute workspace path. |
| `saBin` | `"sagent"` | Executable used in every command. |
| `maxRounds` | `objective.budget.max_rounds` | Campaign round cap (recorded by `campaign begin`). |
| `controller` | `"tree"` | `tree`, `linear`, or `evolution` for `search next`. |
| `label` | `""` | Campaign label. |
| `roundArgs` | `{}` | Passed to each round: `maxHypotheses` (3), `maxRuns` (6), `runTimeoutSec` (1800), `templatesDir`, `bankReport`. |
| `agentPrefix` / `useAgentTypes` | `"science-agent:"` / `true` | Agent type naming. |
| `roundWorkflow` / `roundScriptPath` | registry lookup | How to reach `science-round` when the plugin name is not registered. |
| `perRoundTokenEstimate` | `150000` | Stop before a round when the turn's token budget is below this, or below 1.2x the largest round so far. |
| `scoutMaxAge` | `2` | Reuse a full round's scout report for up to this many later non-debug rounds (`0` re-scouts every round). |

The campaign stops early (without a stop rule) when a round cannot run at all: `round-workflow-unavailable`,
`round-crashed`, `missing-args`, or `domain-unavailable`. A crashed round is closed and never replayed on its round id.

### 4.2 `science-round`

| Argument | Default | Meaning |
|---|---|---|
| `workspace`, `roundId` | required | From `sagent round begin`. |
| `mode` | `"full"` | `quick`, `full`, or `debug`; changes the graph. |
| `pack` | fetched by the clerk | The domain pack object. |
| `briefing`, `nextActions` | from the scout | Prior state and controller actions from `campaign check`. |
| `scout`, `scoutFrom` | none | A cached scout report (and the round it came from); skips the scout agent. |
| `maxHypotheses`, `maxRuns`, `runTimeoutSec` | 3, objective budget or 6, objective budget or 1800 | Budget; `maxRuns` counts seed runs. |
| `maxScreen` | 6 | Most candidates screened on one seed before promotion. |
| `strategy`, `slots`, `tabuFamilies` | `exploit`, none, none | From `campaign check`: explore rounds, typed work slots dealt round-robin to the lenses, and families to avoid. |
| `templatesDir`, `bankReport`, `saBin`, `agentPrefix`, `useAgentTypes` | | As for the campaign. |

Missing `workspace`/`roundId` returns `{started: false, reason: "missing-args"}` immediately.

In `full` mode each lens proposes `ceil(slots / lenses)` ideas when every lens has a slot (no selector call), else 2.
The L3 statistician runs only in `full` mode with at least one non-failing run (`l3Skipped` says why otherwise);
`round close` always runs the deterministic design check and returns it as `design`.

## 5. Invocation

```text
Workflow({ name: "science-agent:science-campaign", args: { workspace, saBin: "sagent", roundArgs: {...} } })
Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/science-campaign.js",
           args: { ..., roundScriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/science-round.js" } })
```

A single round: `sagent round begin --mode M --json`, then
`Workflow({name: "science-agent:science-round", args: {workspace, roundId, mode, ...}})`, then
`sagent round close <round_id> --json`. Script paths are also printed by
`sagent workflow path science-campaign --json`.

## 6. Resume and idempotency

- **Workflow replay.** Re-invoking with `resumeFromRunId` and the same args returns cached results for
  the unchanged prefix of agent calls, including clerk calls, so `campaign begin` / `round begin` are
  not repeated.
- **Run reuse.** `sagent run execute` reuses a finished run with the same signature (objective hash,
  code tree, inputs, env lock, entrypoint, seed).
- **Close.** `sagent round close` on an ended round returns the recorded outcome and a fresh campaign
  check without appending events.
- A round that was begun but never closed stays `running`; `campaign check` lists it under
  `rounds.open`. Close it with `sagent round close <id>` before starting a new campaign.

## 7. Failure handling

| Failure | Behavior |
|---|---|
| `doctor` errors | Campaign returns `doctor-failed` with the errors; nothing is recorded. |
| `campaign begin` refused (objective not locked) | Returns `campaign-begin-failed` with the CLI error. |
| A stop rule already fires in preflight | No round starts; the campaign is ended with the fired rules. |
| Scout `blocked` / no hypotheses / registration failed | The round returns `started: false`; Close still runs and records `blocked`/`failed`. |
| Selector output invalid | Lens round-robin fallback, logged. |
| Engineer returns no run ids | Verify is skipped for that candidate. |
| Verifier `repairable: true` | One repair as a child run, one re-verify; never a loop. |
| `round close` fails | Campaign stops with `round-close-failed`; the round stays open for a manual close. |
| Workflow tool unavailable | One quick round by hand, closed with `sagent round close`; never fake fan-out. |

The workflows never delete a failed run, never write a verdict, and never call `kaggle submit`.

## 8. What is enforced where

| Limit | Enforced by |
|---|---|
| Per-run timeout / memory | `sagent run execute --timeout`, rlimits, RSS monitor |
| Seed-run budget per round | `science-round` (`floor(maxRuns / seeds)` candidates) |
| Rounds, target, no-improvement, deadline, spend | `sagent campaign check` (code), acted on by the campaign |
| Outcome and winner | `sagent round close` → `sagent decide` |
| Public submissions | `sagent submit upload` + human token |

`max_usd` counts recorded spend only: run `usd_estimate` plus agent cost entries (`round close
--tokens-out` records the round's token count; dollar cost is recorded only when supplied).
