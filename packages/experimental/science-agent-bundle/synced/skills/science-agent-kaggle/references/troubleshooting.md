# Troubleshooting

Each entry gives the symptom, the usual cause, and the exact recovery commands. Stop and report the
blocking step rather than improvising around it. In particular, do not edit `.sa/ledger`,
`.sa/objects`, the hidden holdout, or the installed verifier.

## 1. No workspace

**Symptom**

```text
ERROR [STATE_CONFLICT] workspace not initialized: .../.sa/config.toml missing
ERROR [STATE_CONFLICT] No science-agent workspace found. Run `sagent init` first, or pass --workspace.
```

**Recovery**

```bash
sagent init --workspace <dir> --competition <slug> --type <tabular|timeseries|cv|nlp|llm> --json
sagent doctor --workspace <dir> --json
sagent objective create --workspace <dir> --file objective.yaml --json
sagent objective lock --workspace <dir> --json
```

`sagent status` and most commands require an existing workspace. `sagent doctor` without a workspace checks
only the global environment.

## 2. Objective not locked

**Symptom**

```text
ERROR [STATE_CONFLICT] objective is not locked; run `sagent objective lock` before executing runs
```

**Recovery**

```bash
sagent objective show --json
sagent objective lock --json
```

If the objective is wrong, update it and lock the new version:

```bash
sagent objective update --file objective.yaml --reason "correct metric column" --json
sagent objective lock --json
```

`sagent objective update` increments the version and sets status back to `active`. Old claims and runs
remain bound to the old objective hash. Re-lock before running.

## 3. Data not frozen, or `data/public` missing

**Symptom**

```text
ERROR [USAGE] no raw data; run `sagent kaggle download` or place files in data/raw
ERROR [STATE_CONFLICT] data is not frozen; run `sagent data freeze` first
ERROR [STATE_CONFLICT] data/public missing; run `sagent holdout create` or `sagent data prepare` first
```

**Recovery**

```bash
# 1. Acquire files into data/raw
sagent kaggle download --competition <slug> --files train.csv,test.csv,sample_submission.csv --json

# 2. Freeze all downloaded files, or a named subset
sagent data freeze --json
sagent data freeze --datasets train,test,sample_submission --json

# 3. Check hashes
sagent data verify --json

# 4. Populate data/public, either without a holdout or with one
sagent data prepare --json
# or
sagent holdout create --strategy auto --frac 0.2 --seed 42 --json
```

`sagent data freeze` takes `--datasets` (plural), not `--dataset`. Freezing chmods `data/raw` read-only.
To change frozen data, make the directory writable, add or replace files, and freeze again; old
claims stay bound to the old hashes and the report should note the data version change. The CLI does
not have a `--force` flag for `data freeze`.

## 4. Kaggle rules 403 or credentials

**Symptom**

```text
ERROR [KAGGLE] kaggle competitions download ... failed: 403 ... Accept the competition rules on kaggle.com, then retry.
```

**Recovery**

1. Open `https://www.kaggle.com/competitions/<slug>/rules` in a browser and accept the rules.
2. Verify the CLI and credentials:

```bash
which kaggle
ls -l ~/.kaggle/kaggle.json      # must be mode 0600
chmod 600 ~/.kaggle/kaggle.json
kaggle competitions list -s <slug>
```

3. Retry:

```bash
sagent kaggle info --competition <slug> --json
sagent kaggle download --competition <slug> --files train.csv,test.csv,sample_submission.csv --json
```

Rules acceptance is a browser action; the CLI cannot perform it. Do not proceed with missing data.

## 5. Low disk

**Symptom**

```text
ERROR [DISK] only 1.3 GB free; free disk space before downloading
```

`sagent doctor` also reports `disk_free` and treats below 2 GB as an error.

**Recovery**

```bash
df -h <workspace>
du -sh <workspace>/.sa/objects <workspace>/.sa/envs <workspace>/runs <workspace>/data
sagent doctor --json
```

Practical options:

- Delete downloaded archives after extraction if they are not part of the frozen manifest. Check
  `data/manifest.json` first.
- Remove unused environments under `.sa/envs/` and rebuild one with `sagent env init`.
- Move large raw data to an external location and keep only the needed files in `data/raw`.
- Do not delete the ledger, the CAS objects referenced by manifests, or failed runs that the report
  cites. `sagent gc` is mentioned in some docs but is not implemented in the current CLI.

## 6. uv or PyPI mirror timeout

**Symptom**

```text
ERROR [MISSING_DEP] uv not found; install uv first
error: Failed to fetch: ... pypi.tuna.tsinghua.edu.cn ... operation timed out
```

**Recovery**

The environment builder resolves an index in this order: `UV_INDEX_URL`, `PIP_INDEX_URL`, then
`pip3 config get global.index-url`. `install.sh` does the same and exports the result.

```bash
# Confirm the mirror
pip3 config get global.index-url
curl -I https://pypi.tuna.tsinghua.edu.cn/simple

# Use a reachable mirror explicitly
export UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# If the mirror is stale or unreachable, use PyPI
export UV_INDEX_URL=https://pypi.org/simple

sagent env init --profile cpu-standard --competition <slug> --json
```

If `uv` itself is missing:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# or: brew install uv
```

The Tsinghua mirror is common on this machine. A timeout on it is an index problem, not a science
problem. Some packages may lag on a mirror; switching indexes is preferable to pinning an older
version that the project does not support.

## 7. Environment install failure

**Symptom**

```text
ERROR [USAGE] unknown profile 'gpu';
ERROR [SAError] failed to install ...
```

**Recovery**

```bash
sagent env show --competition <slug> --json
sagent env init --profile cpu-standard --competition <slug> --python 3.13 --json
sagent env restore --competition <slug> --json
```

Valid profiles: `cpu-light`, `cpu-standard`, `cpu-full`, `cv`, `nlp`, `llm`. The first three are the
supported local tabular profiles. `cv`, `nlp`, and `llm` install heavy stacks and are scaffolds on
this machine. If a profile fails, use `cpu-standard` for a smoke run and keep the GPU experiment as a
remote-backend TODO. Do not claim a GPU result that was never run.

The toolkit requires Python `>=3.11,<3.15`; the install script and environments use 3.13 to avoid
missing ML wheels on 3.14.

## 8. Sandbox selftest failure

**Symptom**

```text
ERROR [SANDBOX] ...    # exit code 6 from `sagent sandbox selftest`
```

**Recovery**

```bash
sagent sandbox selftest --json
ls -l /usr/bin/sandbox-exec
sagent doctor --json
```

The selftest checks four things: writing inside `output/` succeeds, writing outside is denied,
reading a fake holdout is denied, and a network connection is denied. It requires macOS and
`/usr/bin/sandbox-exec`.

If the sandbox is unavailable, runs use the portable fallback: `sandbox.isolation = "weak"`, and L0
emits a warning. Weak isolation caps trust at `medium`; it does not block a run, but it must not be
reported as `high` trust. If the selftest fails on a machine where `sandbox-exec` exists, inspect the
generated `runs/<run_id>/sandbox.sb` and the denied paths. Do not disable the sandbox for a final
claim; fix the profile or accept weak isolation explicitly.

## 9. Workflow not registered

**Symptom**

```text
Workflow name not found: science-agent:science-campaign   (or science-round / kaggle-round)
```

**Recovery**

Use the script path form:

```text
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/science-campaign.js",
  args: {
    workspace: "/absolute/workspace",
    saBin: "sagent",
    roundScriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/science-round.js",
    roundArgs: { maxHypotheses: 3, maxRuns: 6, runTimeoutSec: 1800 }
  }
})
```

Then check the installation:

```bash
sagent workflow path science-campaign --json
sagent plugin status --json
claude plugin list
sagent plugin install --project <dir> --force --json   # project-local
```

If the Workflow tool itself is unavailable, use quick mode and say so. Do not hand-roll a fake
multi-agent sequence.

## 10. No candidates after decide

**Symptom**

`sagent decide` returns `chosen_run_id: null`, or every candidate is in `eliminated`.

**Recovery**

```bash
sagent decide --round <round_id> --json
sagent run list --round <round_id> --json
sagent run list --status failed --json
sagent run logs <run_id> --tail 120 --json
sagent verify run <run_id> --levels L0,L1,L2,L3 --json
```

Elimination reasons are `no_verdict`, `L0-L3 blocking fail`, and `no_verified_metric`. A run with no
verdict was never verified; a failed verdict has a blocking check; a run with no verified metric
failed L2 or produced no parsable `metrics.json`.

Fix the code or output and create a child run, then verify again:

```bash
sagent run execute --code experiments/<round>/<hypothesis> --experiment <id> --hypothesis <id> \
  --seeds 42,43,44 --parent-run <failed_run_id> --round <round_id> --json
sagent verify run <new_run_id> --levels L0,L1,L2,L3 --json
sagent decide --round <round_id> --json
```

Do not fabricate a candidate. If there is genuinely no verified run, report the blocking checks and
choose a debug-only round.

## 11. Report strict failure

**Symptom**

```text
ERROR [VERIFY_FAILED] ...    # exit code 3 from `sagent report check --strict`
{"ok": false, "issues": [{"line": 12, "token": "0.91", "text": "..."}]}
```

**Recovery**

```bash
sagent report check <path> --strict --json
sagent report build --round <round_id> --json
sagent report explain <seq-or-hash> --json
```

For each issue, remove the bare number or replace it with a slot that resolves from verified state
(`{{metric:RUN:value}}`, `{{claim:ID}}`, `{{table:verified_runs}}`, and so on). Do not use
`--no-strict` for a final report and do not guess the value. If the number is a public LB score, label
it external and keep it out of CV comparisons.

## 12. Submission limit reached

**Symptom**

```text
ERROR [APPROVAL_REQUIRED] submission limit reached (2/2)
```

**Recovery**

```bash
sagent submit list --json
sagent objective show --json
```

`sagent submit upload` counts submissions with status `uploaded` or `scored` against
`objective.competition.submission.max_public_submissions` (default 2) or the workspace budget
default. Do not create a second submission record to bypass the counter. If the limit is genuinely
wrong, update the objective with a reason and lock the new version, then confirm the human wants to
use another probe. A public probe is for final validation, not for model selection.

## 13. Ledger verification failure

**Symptom**

```text
ERROR [VERIFY_FAILED] ...    # exit code 3 from `sagent ledger verify`
{"ok": false, "errors": [{"kind": "hash", "seq": 42, ...}]}
```

**Recovery**

Stop experiments. Do not edit `events.jsonl` by hand.

```bash
sagent ledger verify --json
sagent ledger anchor --json
sagent ledger explain <seq-or-hash> --json
sagent state rebuild --json
```

`sagent state rebuild` regenerates `.sa/state.json` from the ledger; it does not repair a broken chain.
The error kinds are `sequence` (deleted, inserted, or reordered events), `prev_hash` (broken link),
`hash` (modified event body), and `head_mismatch` (`HEAD` does not match the last event). Restore the
ledger from a trusted backup or version control, then verify again. Report the incident instead of
running experiments on a state whose history is not trustworthy.

## 14. Single-seed warning

**Symptom**

L3 reports `seeds.count` as `warn`:

```text
1 seed(s), required 3 for final claims
```

**Recovery**

```bash
sagent run execute --code experiments/<round>/<hypothesis> --experiment <id> --hypothesis <id> \
  --seeds 42,43,44 --round <round_id> --json
sagent verify run <run_id> --levels L0,L1,L2,L3 --json
sagent decide --round <round_id> --json
```

The warning does not fail the run, but a final claim should have at least three seeds. `sagent decide`
aggregates seed-level values by label or experiment and uses `mean - risk_penalty * SD` (maximize) or
`mean + risk_penalty * SD` (minimize). A single-seed result is exploratory. Do not substitute fold SD
for seed SD or claim a larger sample than was run.

## 15. Other common failures

| Symptom | Cause | Recovery |
|---|---|---|
| `sagent run execute` exits 0 but the experiment failed | The CLI exits 0 after creating the run record. | `sagent run show <id> --json`, inspect `status` and `error`; `sagent run logs <id> --tail 120 --json`; `sagent verify run <id>`. |
| L0 `outputs.declared` fails | `metrics`, `predictions_oof`, `folds`, or `cv_design` is missing. | Add the file to `run.yaml` and write it; new run. |
| L2 `metric.recompute` fails | Reported value differs from OOF recomputation, or the metric is unsupported. | Use a supported metric; compute `metrics.json` from the same predictions; do not edit the OOF file. |
| L2 `oof.coverage` fails | Missing or duplicate train IDs in OOF. | Emit exactly one OOF row per train ID. |
| L3 `cv.design_present` fails | No `cv_design.json`. | Write strategy, group/time columns, and `data_source`. |
| L3 leakage fails | Duplicate, target, time, or group leakage. | Fix the split or feature in a new run; do not change the CV after seeing the score. |
| L3 pandas skipped the duplicate check | pandas is not importable by the CLI. | Install the `[ml]` extra for the toolkit environment. |
| `sagent verify run` crashes instead of writing a verdict | Malformed CSV, missing target column, or unsupported metric in the holdout path. | Inspect the traceback, fix the artifact format, re-verify. |
| Holdout check says no token | L5 requires an approval token. | `TOKEN=$(sagent approve --action holdout-reveal --ttl 10 --json)`, then `sagent verify run <id> --holdout-token "$TOKEN"`. |
| Holdout labels changed | The sealed file hash no longer matches. | Do not re-seal casually; create a new holdout and disclose the change. |
| `sagent submit prepare` refuses | No passing/warning verdict, or the decision chose another run. | `sagent verify run <id>`; `sagent decide --round <id>`; pass the correct `--decision`. |
| `sagent approve` says no prepared submission | No `prepared` submission exists. | `sagent submit prepare --run <id> --decision <id> --json` first. |
| Token expired | TTL elapsed. | Create a new token in the terminal. |
| MCP server will not start | MCP extra missing, wrong workspace, or `.sa` absent. | `uv tool install ... [mcp]`; `sagent mcp serve --workspace <abs> --transport stdio`; check `SA_WORKSPACE`. |
| Desktop shows no tools | Config not merged or Desktop not restarted. | Re-check `~/Library/Application Support/Claude/claude_desktop_config.json`; restart. |
| `sagent round next` keeps returning the same stage | The stage was never marked completed. | `sagent round stage <round_id> <stage> --status completed --summary "..." --json`. |
| `sagent decide` has no decision for the report | Decide was not run. | `sagent decide --round <round_id> --json`, then `sagent report build --round <round_id>`. |

## 16. Recovery principles

1. Read the error code. `USAGE`/2, `VERIFY_FAILED`/3, `BUDGET`/4, `APPROVAL_REQUIRED`/5, `SANDBOX`/6,
   `STATE_CONFLICT`/7, `INTERNAL`/10.
2. If the ledger fails, stop. Nothing downstream is trustworthy.
3. If data is missing, do not synthesize it. Freeze the real files or stop.
4. If a verifier fails, fix the code or output. Never "fix" leakage by changing the score or the CV.
5. If a report strict check fails, remove the unsourced number or add a slot. Never disable strict
   mode for a final report.
6. If a submission or holdout action needs a token, ask the human. Do not try to mint one from an
   agent.
