# CLI reference

This is the command surface implemented in `src/science_agent/cli.py`. Commands are Typer
subcommands; `--workspace/-w` and `--json` are defined per command, not as a global parser. There is
no `--actor` or `--idempotency-key` flag in the current CLI.

## 1. Conventions

### 1.1 Workspace and JSON

- `--workspace <dir>` / `-w <dir>` selects the workspace. The default is `.` for commands that
  accept it.
- `--json` prints a machine-readable envelope. Without it, the CLI prints pretty JSON or a plain
  value.
- `sagent mcp serve` is the exception: it starts a server and does not take `--json`.

### 1.2 JSON envelope

Success:

```json
{"ok": true, "data": {"...": "..."}}
```

Command error:

```json
{
  "ok": false,
  "error": {
    "code": "STATE_CONFLICT",
    "message": "objective is not locked; run `sagent objective lock` before executing runs",
    "details": null
  }
}
```

Unexpected internal error:

```json
{"ok": false, "error": {"code": "INTERNAL", "message": "..."}}
```

The envelope does **not** include a `ledger` field. The design note mentions
`{ok, command, data, ledger:{seq,hash}}`; the current `_call` helper emits only `ok` and `data` (or
`ok` and `error`). Run `sagent ledger anchor --json` separately if you need the anchor.

### 1.3 Exit codes

| Code | Meaning | Examples |
|---|---|---|
| 0 | Success | Any command that completes, including a run record whose experiment failed. |
| 2 | Usage, schema, missing dependency, Kaggle error, or doctor failure | `UsageError`, `MISSING_DEP`, `KAGGLE`, `sagent doctor` when `ok` is false. |
| 3 | Verification failure | `sagent verify run` with a `fail` verdict; `sagent verify report` / `sagent report check --strict` with issues; `sagent submit validate` failure; `sagent ledger verify` failure. |
| 4 | Budget, disk, or resource limit | `BudgetError`, `DISK` when free space is below the download threshold. |
| 5 | Approval required | `sagent submit prepare` without a passing verdict; `sagent submit upload` with a bad token or a reached limit. |
| 6 | Sandbox failure | `SandboxError`, `sagent sandbox selftest` failure. |
| 7 | State conflict | Uninitialized workspace, unlocked objective, missing data, missing run, unknown ID; `STALE_CODE` when a run's code is byte-identical to its parent's or to another hypothesis's run. |
| 10 | Internal error or lock failure | Uncaught exceptions; `LOCK` errors. |

`sagent verify run` exits 3 only when the aggregate verdict is `fail`; a `warn` exits 0. `sagent verify
design` does not change the exit code based on its findings.

## 2. Workspace and environment

| Command | Key flags | Description |
|---|---|---|
| `sagent init` | `--workspace/-w DIR`, `--competition SLUG`, `--type {tabular,timeseries,cv,nlp,llm}`, `--json` | Create `.sa/`, config, ledger, data directories, and `.gitignore`; append `workspace.created`. |
| `sagent doctor` | `--workspace/-w DIR`, `--json` | Check Python, uv, Kaggle CLI/credentials, sandbox, disk, workspace, ledger, objective, and frozen data. Exit 2 if an error-level check fails. |
| `sagent status` | `--workspace/-w DIR`, `--json` | Show workspace, objective, latest round, run/verified/claim/submission counts, and data manifest. |
| `sagent schema export` | `--out DIR` (default `schema`), `--workspace/-w DIR`, `--json` | Write JSON Schemas for the public models under `<workspace>/<out>`. |
| `sagent plugin install` | `--project DIR` (required), `--force`, `--json` | Copy `skills`, `agents`, `commands`, and `workflows` into `<project>/.claude`; write `science-agent-installed.json`. |
| `sagent plugin status` | `--json` | Report whether the global plugin is installed and whether the current directory has a project-local install. |
| `sagent workflow path` | `NAME` (default `kaggle-round`; also `science-round`, `science-campaign`), `--json` | Resolve a workflow script from package data, `./plugin/workflows`, or the repository. |
| `sagent sandbox selftest` | `--workspace/-w DIR`, `--json` | Prove allowed write, denied outside write, denied holdout read, and denied network. Exit 6 on failure. |
| `sagent mcp config` | `--workspace/-w DIR`, `--json` | Print the `mcpServers` block for Claude Desktop. There is no `--print` flag; the command prints. |
| `sagent mcp serve` | `--workspace/-w DIR`, `--transport stdio or streamable-http` | Start the MCP server. No `--json`. |
| `sagent env init` | `--profile NAME` (default `cpu-standard`), `--competition SLUG`, `--python VERSION`, `--workspace/-w DIR`, `--json` | Create a uv venv and install a profile; write `env.lock.json`. |
| `sagent env show` | `--competition SLUG`, `--workspace/-w DIR`, `--json` | Show the environment path, existence, and lock. |
| `sagent env restore` | `--competition SLUG`, `--workspace/-w DIR`, `--json` | Recreate the environment from `env.lock.json`. |

Profiles: `cpu-light`, `cpu-standard`, `cpu-full`, `cv`, `nlp`, `llm`.

## 3. Objective

| Command | Key flags | Description |
|---|---|---|
| `sagent objective create` | `--file/-f YAML or JSON` (required, must exist), `--workspace/-w DIR`, `--json` | Validate and record an objective; assign an ID if absent; status `active`. |
| `sagent objective show` | `--workspace/-w DIR`, `--json` | Print the current objective. |
| `sagent objective lock` | `--workspace/-w DIR`, `--json` | Compute the semantic `objective_hash`, set status `locked`, append `objective.locked`. Required before runs. |
| `sagent objective update` | `--file/-f YAML or JSON`, `--reason TEXT`, `--workspace/-w DIR`, `--json` | Replace the objective, increment `version`, set status `active`. Re-lock before running. |

## 4. Kaggle and data

| Command | Key flags | Description |
|---|---|---|
| `sagent kaggle info` | `--competition/-c SLUG`, `--json` | Best-effort metadata, file list, title, and metric hint. Metric and rules still need confirmation. |
| `sagent kaggle download` | `--competition/-c SLUG`, `--files a,b,c`, `--force`, `--workspace/-w DIR`, `--json` | Download files to `data/raw`, extract ZIPs, append `data.downloaded`, and set the config slug. Refuses below 2 GB free. |
| `sagent kaggle submissions` | `--competition/-c SLUG`, `--json` | List Kaggle submissions for the competition. |
| `sagent data freeze` | `--datasets a,b,c`, `--workspace/-w DIR`, `--json` | Hash `data/raw`, write `data/manifest.json`, chmod read-only, append `data.frozen`. |
| `sagent data profile` | `--dataset NAME` (default `train`), `--target COL`, `--adversarial`, `--workspace/-w DIR`, `--json` | Profile dtypes, missingness, cardinality, target, ID/time/group candidates, duplicate rows, and leakage suspects; write `.sa/profile.json`. |
| `sagent data prepare` | `--workspace/-w DIR`, `--json` | Copy frozen train/test/sample/other into `data/public` without a holdout. |
| `sagent data verify` | `--workspace/-w DIR`, `--json` | Re-hash frozen datasets against `data/manifest.json`. |
| `sagent holdout create` | `--strategy {auto,stratified,group,time}`, `--frac FLOAT`, `--seed INT`, `--target COL`, `--id-column COL`, `--group-column COL`, `--time-column COL`, `--workspace/-w DIR`, `--json` | Split train, write public files and `holdout_features.csv`, seal labels outside the workspace, append `holdout.created`. |
| `sagent holdout status` | `--workspace/-w DIR`, `--json` | Print the holdout pointer and metadata, including reveal records. |

## 5. Hypotheses and experiments

| Command | Key flags | Description |
|---|---|---|
| `sagent hypothesis add` | `--statement/-s TEXT` (required), `--rationale TEXT`, `--prediction TEXT`, `--scope TEXT`, `--design TEXT` (default `ablation`), `--seeds 42,43,44`, `--parent ID`, `--workspace/-w DIR`, `--json` | Record a hypothesis with a planned experiment. |
| `sagent hypothesis list` | `--status STATUS`, `--workspace/-w DIR`, `--json` | List hypotheses, optionally filtered. |
| `sagent hypothesis show` | `HYPOTHESIS_ID`, `--workspace/-w DIR`, `--json` | Show one hypothesis. |
| `sagent experiment create` | `--hypothesis ID` (repeatable), `--design TEXT`, `--seeds 42,43,44`, `--workspace/-w DIR`, `--json` | Record an experiment linked to one or more hypotheses. |
| `sagent experiment list` | `--workspace/-w DIR`, `--json` | List experiments. |

## 6. Runs

| Command | Key flags | Description |
|---|---|---|
| `sagent run execute` | `--code DIR` (required, must exist), `--experiment ID`, `--hypothesis ID` (repeatable), `--seeds 42,43,44`, `--label TEXT`, `--round ID`, `--parent-run ID`, `--allow-network`, `--timeout SEC`, `--memory MB`, `--workspace/-w DIR`, `--json` | Create one run per seed in a sandbox, execute, commit declared outputs, and write manifests. Reuses an identical finished signature of the same hypothesis. Refuses with `STALE_CODE` when the code equals the parent run's code or a run of a different hypothesis: implement the change first. Writes `runs/<id>/supervisor.json` (owner pid, heartbeat) while the run executes. Exits 0 even if the experiment fails. |
| `sagent run show` | `RUN_ID`, `--workspace/-w DIR`, `--json` | Show the run manifest. |
| `sagent run list` | `--status STATUS`, `--round ID`, `--workspace/-w DIR`, `--json` | List runs, optionally filtered and sorted by creation time. |
| `sagent run logs` | `RUN_ID`, `--tail N` (default 80), `--workspace/-w DIR`, `--json` | Return the last N lines of stdout and stderr. |

## 7. Verification

| Command | Key flags | Description |
|---|---|---|
| `sagent verify run` | `RUN_ID`, `--levels L0,L1,L2,L3,L4` (default), `--rerun`, `--holdout-token TOKEN`, `--workspace/-w DIR`, `--json` | Run the ladder, write `verdict.json` and `metrics_verified.json`, append `verdict.recorded`. Exit 3 on a `fail` verdict. |
| `sagent verify runs` | `RUN_ID...`, `--hypothesis ID`, `--superseded ID` (repeatable), `--levels L0,L1,L2,L3` (default), `--rerun`, `--workspace/-w DIR`, `--json` | Verify a candidate's runs and return one code-derived verdict with `repairable`, `suspicious`, `duplicate_predictions`. Exit 3 on a `fail` verdict. |
| `sagent run confirm` | `--round ID`, `--hypothesis ID`, `--timeout S`, `--memory MB`, `--workspace/-w DIR`, `--json` | Run a promoted candidate's remaining planned seeds from its screened code snapshot. |
| `sagent verify design` | `--round ID`, `--workspace/-w DIR`, `--json` | Cross-run L3 summary: verified runs, baseline, best, delta, and multiple-comparison count. |
| `sagent verify report` | `FILE`, `--strict/--no-strict` (default strict), `--json` | Same as `sagent report check`; exit 3 on issues in strict mode. |

L5 is requested with `--levels ...,L5` or by supplying `--holdout-token`. The token must be a
`holdout-reveal` token bound to `sha256_labels`.

## 8. Evidence and claims

| Command | Key flags | Description |
|---|---|---|
| `sagent evidence add` | `--type {run,verdict,literature,data,doc,note}`, `--source JSON`, `--relation {supports,contradicts,neutral}`, `--quality {verified,external_unverified,soft}`, `--conditions TEXT`, `--workspace/-w DIR`, `--json` | Record an evidence object. `--source` is a JSON string. |
| `sagent claim add` | `--statement/-s TEXT` (required), `--scope TEXT`, `--type TEXT` (default `data_result`), `--evidence ID` (repeatable), `--confidence {low,medium,high}`, `--workspace/-w DIR`, `--json` | Add an `unverified` claim. Unknown evidence IDs are a usage error. |
| `sagent claim list` | `--status STATUS`, `--workspace/-w DIR`, `--json` | List claims. |
| `sagent claim audit` | `--workspace/-w DIR`, `--json` | Flag missing evidence IDs and supported claims without verdicts (negative results exempt). |
| `sagent claim sync` | `--round ID`, `--workspace/-w DIR`, `--json` | Generate and promote claims from verified runs, failed runs, and the decision. |

## 9. Rounds, search, and decision

| Command | Key flags | Description |
|---|---|---|
| `sagent round begin` | `--mode TEXT` (default `full`), `--controller TEXT` (default `tree`), `--campaign ID`, `--workspace/-w DIR`, `--json` | Create a round with six pending stages and append `round.started`. Returns `round_id`. |
| `sagent round close` | `ROUND_ID`, `--tokens-out N`, `--tokens-in N`, `--usd X`, `--review-file PATH\|-`, `--begin-next`, `--brief`, `--workspace/-w DIR`, `--json` | decide → resolve hypotheses → claim sync → report build + strict check → verify design → stage marks → outcome (`improved`/`no_change`/`failed`/`blocked`) → cost record → round end; returns the campaign check when the round belongs to a campaign. `--begin-next` also begins the next round when no stop rule fired (`next_round`). `--brief` returns only the controller fields (outcome, best run, delta, report path, brief campaign check, next round). Idempotent. |
| `sagent round promote` | `ROUND_ID`, `--slots N`, `--workspace/-w DIR`, `--json` | Rank screened candidates against the reference on their screening seed and record which get the remaining seeds. Idempotent. |
| `sagent round status` | `--round ID`, `--workspace/-w DIR`, `--json` | Show a round, or the latest round if no ID is given. |
| `sagent round next` | `ROUND_ID`, `--workspace/-w DIR`, `--json` | Return the first pending/running stage with instructions, or `{"done": true}`. |
| `sagent round stage` | `ROUND_ID`, `NAME`, `--status {pending,running,completed,failed,skipped}`, `--summary TEXT`, `--agent TEXT`, `--workspace/-w DIR`, `--json` | Record a stage transition. Valid names: `scout`, `hypotheses`, `execute`, `verify`, `decide`, `report`. |
| `sagent round end` | `ROUND_ID`, `--outcome TEXT` (default `finished`), `--best-run ID`, `--next TEXT`, `--workspace/-w DIR`, `--json` | Record the round outcome and recommendation. Does not validate stage completion. |
| `sagent search next` | `--policy {tree,linear,evolution}` (default `tree`), `--round ID`, `--workspace/-w DIR`, `--json` | Return controller actions and, for tree, UCB candidates. |
| `sagent search curve` | `--workspace/-w DIR`, `--json` | Best-so-far table with cost and wall time. |
| `sagent decide` | `--round ID`, `--workspace/-w DIR`, `--json` | Rank verified candidates deterministically; record a decision with eliminated reasons. |
| `sagent campaign begin` | `--max-rounds N`, `--controller TEXT`, `--label TEXT`, `--with-check`, `--reuse-open`, `--brief`, `--json` | Start a campaign (objective must be locked). `--with-check` adds the first stop-rule evaluation as `check`; `--reuse-open` returns a running campaign with no rounds (`reused: true`) instead of starting another, so a repeated begin is harmless; `--brief` makes that check compact. |
| `sagent campaign check` | `--campaign ID`, `--policy TEXT`, `--now ISO`, `--brief`, `--json` | Evaluate stop rules; return `stop`, `fired`, `next_mode`, controller actions, compact briefing. `--brief` (used by workflows, whose clerks must copy the envelope back) keeps it under ~2 KB: top 3 actions, best run, counts, failure ids, lens calibration; agents read `state briefing` for the rest. |
| `sagent campaign end` | `CAMPAIGN_ID`, `--reason TEXT`, `--json` | Record the end with the fired rules. |
| `sagent campaign list` | `--json` | List campaigns. |
| `sagent hypothesis register` | `--file PATH\|-`, `--round ID`, `--select K`, `--json` | Batch-register hypotheses + experiments from a JSON list; ids in input order. With `--select K` the list is a pool: code picks up to K and returns `{selected, deferred}`. |
| `sagent domain list` / `domain show` | `--id ID`, `--json` | Domain packs; `show` defaults to the workspace objective's pack. |

The global `-w/--workspace DIR` before the subcommand (`sagent -w DIR status`) runs as if started in
that directory; the per-command `--workspace/-w` still works.

`sagent decide` is a top-level command, not under `round` or `search`. It has no `--risk-penalty` flag;
the API default is `0.5`.

## 10. Reports

| Command | Key flags | Description |
|---|---|---|
| `sagent report build` | `--round ID`, `--out FILE`, `--workspace/-w DIR`, `--json` | Build a report from verified state. Without `--round`, writes `reports/latest.md`; with `--round`, writes `reports/rounds/<id>/report.md`. Returns path, anchor, and strict `checks`; it exits 3 when the internal strict check finds an issue. There is no `--strict` flag. |
| `sagent report check` | `FILE`, `--strict/--no-strict` (default strict), `--json` | Check a report for unresolved slots and unmarked numbers. Exit 3 on issues in strict mode. |
| `sagent report explain` | `ANCHOR` (seq or hash), `--workspace/-w DIR`, `--json` | Resolve a ledger anchor to its event and predecessor. |

## 11. Submission and approval

| Command | Key flags | Description |
|---|---|---|
| `sagent submit validate` | `FILE`, `--workspace/-w DIR`, `--json` | Check columns, IDs, duplicates, row count, and empty values against `data/public/sample_submission.csv`. Exit 3 on failure. |
| `sagent submit prepare` | `--run ID` (required), `--decision ID`, `--message TEXT`, `--workspace/-w DIR`, `--json` | Require a pass/warn verdict and a matching decision; copy the submission into `submissions/`; record it as `prepared`. |
| `sagent submit upload` | `--submission ID` (required), `--approval-token TOKEN` (required), `--message TEXT`, `--workspace/-w DIR`, `--json` | Verify the token, the file hash, and the public submission limit, then call the Kaggle CLI. The only external write. |
| `sagent submit record-score` | `--submission ID`, `--public FLOAT`, `--private FLOAT`, `--workspace/-w DIR`, `--json` | Record public/private scores and mark the submission `scored`. |
| `sagent submit list` | `--workspace/-w DIR`, `--json` | List submissions. |
| `sagent approve` | `--action {submit,holdout-reveal}`, `--subject TEXT`, `--ttl MINUTES` (default 10), `--workspace/-w DIR`, `--json` | Create a short-lived token. For `submit`, the subject defaults to the latest prepared submission's SHA-256; for `holdout-reveal`, to `sha256_labels`. Run in a terminal. |

## 12. Cost, ledger, and state

| Command | Key flags | Description |
|---|---|---|
| `sagent cost record` | `--round ID`, `--tokens-in INT`, `--tokens-out INT`, `--usd FLOAT`, `--source TEXT` (default `manual`), `--workspace/-w DIR`, `--json` | Record an agent cost entry. |
| `sagent cost summary` | `--workspace/-w DIR`, `--json` | Sum run wall/CPU/USD estimates and list agent cost entries. This is the implemented cost report command. |
| `sagent ledger verify` | `--workspace/-w DIR`, `--json` | Check sequence, hash chain, and HEAD. Exit 3 on failure. |
| `sagent ledger anchor` | `--workspace/-w DIR`, `--json` | Return `{seq, hash}` for the head. |
| `sagent ledger explain` | `ANCHOR`, `--workspace/-w DIR`, `--json` | Return the event and its predecessor. |
| `sagent state rebuild` | `--workspace/-w DIR`, `--json` | Rebuild `.sa/state.json` from the ledger. |
| `sagent state briefing` | `--workspace/-w DIR`, `--json` | Return the next-round briefing. |
| `sagent state lessons` | `--workspace/-w DIR`, `--json` | Tested hypotheses (predicted vs observed), per-lens calibration, backlog, recurring checks, frontier; bounded for prompts. |
| `sagent state show` | `--workspace/-w DIR`, `--json` | Print the full projection. |
| `sagent reap` | `--dry-run`, `--now ISO`, `--workspace/-w DIR`, `--json` | Mark work a dead process left `running`: runs whose supervisor is gone become `failed` (`orphaned`), open rounds with no live run that were superseded, belong to an ended campaign, or idled past `execution.stale_after_s` (default 7200) end `aborted`, and such campaigns end. `campaign begin` and `round begin` reap automatically; an aborted round does not count toward stop-rule streaks. |

## 13. Commands not present in this CLI

These appear in the design notes, the skill, or older docs but are not implemented as `sagent`
subcommands. Use the stated alternative.

| Not implemented | Alternative |
|---|---|
| `sagent config` | Edit `.sa/config.toml` directly or use `sagent init`; `sagent status` reads it. |
| `sagent workspace-path` | Print the resolved workspace root. |
| `sagent gc` | Remove failed run directories beyond the most recent `--keep-last` (default dry-run; `--yes` to delete). |
| `sagent export bundle` | Copy the workspace or archive it manually. |
| `sagent artifact list/show/verify/export` | Read `.sa/objects/sha256/...` and run manifests; no artifact CLI. |
| `sagent verifier list/explain` | Read `science_agent.verifiers`; verdicts list check IDs. |
| `sagent judge add` | `sagent evidence add --type note --quality soft`. |
| `sagent holdout reveal` | `sagent approve --action holdout-reveal` then `sagent verify run --holdout-token`. |
| `sagent verify holdout RUN` | `sagent verify run RUN --holdout-token TOKEN`. |
| `sagent claim show/promote/dispute/supersede` | `sagent claim list` and `sagent claim sync`; the extra lifecycle functions exist only in `science_agent.claims`. |
| `sagent search record/compare` | `sagent search next`, `sagent search curve`, `sagent decide`. |
| `sagent run sweep/status` | `sagent run execute --seeds ...`; `sagent run show`; `sagent run rerun <run>`. |
| `sagent round resume` | `sagent round status` / `sagent round next`; re-invoke the workflow with the same round ID. |
| `sagent cost report` | `sagent cost summary`. |
| `sagent experiment show` | `sagent experiment list`; read `state.experiments` with `sagent state show`. |
| `sagent doctor --strict` | `sagent doctor --json`; inspect `ok` and `errors`. |
| `sagent mcp config --print` | `sagent mcp config` (it prints). |
| `sagent report build --strict` | `sagent report build` (internal strict check) followed by `sagent report check --strict`. |
| Global `--actor`, `--idempotency-key` | Not implemented; actors are set by the command path. |

If a command in this table is required, extend `cli.py` rather than assuming the design note is
already wired.

## 14. Folds and benchmark

| Command | Key flags | Description |
|---|---|---|
| `sagent folds freeze` | `--k 5`, `--strategy auto,stratified,kfold,group,time`, `--seed`, `--group-column`, `--time-column`, `--workspace/-w DIR`, `--json` | Write `data/public/cv_folds.csv` once (event `folds.frozen`). Runs read `SA_DATA_DIR/cv_folds.csv`; the shipped tabular templates use it, and L3 `cv.frozen_folds` warns when a run's `folds.csv` differs. Freezing again returns the record. |
| `sagent folds show` | `--workspace/-w DIR`, `--json` | The frozen-folds record, or null. |
| `sagent bench list` | `--json` | Benchmark packs and tasks. |
| `sagent bench prepare` | `TASK`, `--out DIR`, `--pack`, `--rep`, `--arm`, `--json` | Seal a hidden split and build a locked bench workspace. |
| `sagent bench run` | `WORKSPACE`, `--launcher CMD`, `--wall-minutes`, `--json` | Launch the agent with a wall-clock limit; reap afterwards. |
| `sagent bench grade` | `WORKSPACE`, `--run ID`, `--arm`, `--results FILE`, `--json` | Score the chosen run on the sealed labels; medal, percentile, CV gap. |
| `sagent bench report` | `--arm` (repeatable), `--results FILE`, `--json` | Per-arm summary and paired comparison of two arms. |

## 15. Per-role models

`.sa/config.toml` may route workflow roles to specific models. Each value is a model name, a `{provider, model}` table, or a
non-empty list of those; a list rotates across parallel calls, so the hypothesis lenses can run on different models.
Roles: `clerk`, `scout`, `hypothesis`, `engineer`, `verifier`, `statistician`, `reporter`; research and paper nodes use
their node name (`plan`, `retrieve-read`, `section`, ...). A role without an entry inherits the session model.

```toml
[agents.models]
clerk = "claude-haiku-5-5"
hypothesis = ["claude-fable-5-2", { provider = "deepseek", model = "deepseek-v4" }]
```

`sagent domain show --json` returns the validated table as `agent_models`; the campaign workflow applies it unless the caller
passes `models` in the workflow args. The research and paper workflows read `models` from their args only.
