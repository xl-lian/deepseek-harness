# Architecture

This document describes the parts of the system that make a result auditable: where truth lives,
how it is recorded, and what the system does and does not protect against. It describes the code as
implemented in `src/science_agent/`; where the implementation differs from an earlier design note,
the implementation is stated first.

## 1. Three planes

The system is split so that the component that produces a result cannot also declare it true.

| Plane | Owns | Does not own |
|---|---|---|
| Control | `plugin/skills/*/SKILL.md`, `plugin/workflows/science-campaign.js` + `science-round.js`, agents and commands. Fans out hypotheses and decides when a barrier is needed; mode, stop, and outcome come from `sagent campaign check` / `round close`. | Truth. A workflow summary is not a decision, and an agent's "looks good" is not a verdict. |
| Infrastructure | The `sagent` CLI and `science_agent` package: ledger, artifact CAS, run manifests, sandbox, environments, search, claims, reports, Kaggle access. | Scientific judgment. It records and enforces, but it does not invent a hypothesis. |
| Verification | Package-owned verifier code (`science_agent.verifiers`, `science_agent.metrics`), the hidden holdout outside the workspace, and hash-chained verdicts. | The worker's intentions. It reads manifests, frozen data, and declared outputs only. |

The control plane may be replaced by a human running `sagent` commands directly. The verification plane
may not be replaced by an agent: `sagent verify` is the only writer of verdicts, and a claim can become
`supported` only through the promotion path (`sagent claim sync` for generated claims, or the Python
`promote_claim` function for manual claims), with passing verdict IDs.

## 2. Ledger

The ledger is the source of truth. It is an append-only JSONL file at
`<workspace>/.sa/ledger/events.jsonl`, protected by an advisory file lock during appends.

### 2.1 Event envelope

Every event has exactly this envelope before hashing:

```json
{
  "schema_version": "event/1",
  "event_id": "ev-1a2b3c4d5e",
  "seq": 42,
  "ts": "2026-10-26T12:34:56.789Z",
  "type": "run.finished",
  "actor": "system",
  "objective_id": "obj-1a2b3c4d5e",
  "payload": {"run": {"...": "..."}},
  "prev_hash": "9f2c...",
  "hash": "3d7e..."
}
```

- `seq` starts at 1 and increases by exactly one per event.
- `prev_hash` is the `hash` of the previous event; the first event uses 64 zeroes
  (`GENESIS = "0" * 64`).
- `hash = sha256(canonical_json(event without the "hash" field))`. Canonical JSON means sorted keys,
  separators `,` and `:`, UTF-8, and `default=str`.
- `actor` is one of `human`, `agent`, or `system` in normal use. The CLI passes these values; it does
  not enforce an enum.
- `objective_id` is nullable for workspace-level events.

`<workspace>/.sa/ledger/HEAD` stores the latest `{ "seq": 42, "hash": "3d7e..." }`. It is an
optimization and a quick anchor, not an independent source of truth.

### 2.2 Verification

`sagent ledger verify` walks the JSONL and reports:

| Error kind | Meaning |
|---|---|
| `sequence` | `seq` is not the expected position. Detects deletion, insertion, or reordering. |
| `prev_hash` | The event does not point at the previous event's hash. |
| `hash` | The event body was modified after it was written. |
| `head_mismatch` | `HEAD` does not match the last event. |

The command returns exit code 3 when verification fails. Experiments must not continue on a
tampered ledger.

### 2.3 Event types

The code appends these event types (some are reserved by the models even if a CLI path does not yet
emit them):

```text
workspace.created
objective.created, objective.updated, objective.locked
data.downloaded, data.frozen
holdout.created, holdout.revealed
hypothesis.added, hypothesis.status_changed
experiment.created, experiment.updated
run.created, run.started, run.finished, run.failed, run.timed_out, run.updated
artifact.committed
verdict.recorded
evidence.added
claim.added, claim.status_changed
decision.recorded
round.started, round.stage_changed, round.ended
submission.prepared, submission.updated
approval.granted
cost.recorded
report.generated
env.created
```

### 2.4 Read model

`<workspace>/.sa/state.json` is a projection of the ledger, rebuilt by `sagent state rebuild`. It is
safe to delete and rebuild. It is not safe to edit: `sagent ledger verify` does not trust it, and
commands that need current state rebuild it from the ledger when necessary.

An earlier design note referred to `.sa/index.sqlite`. The current code uses
`.sa/state.json`; the `.gitignore` still mentions `index.sqlite`, but no SQLite index is built.

## 3. Artifact CAS

Declared run outputs are copied into a content-addressed store:

```text
<workspace>/.sa/objects/sha256/<first 2 hex>/<next 2 hex>/<full sha256>
```

The store is keyed only by content hash, so identical outputs across runs share one object. The
artifact record written to the ledger and to the manifest is:

```json
{
  "artifact_id": "a-1a2b3c4d5e",
  "sha256": "ab12...",
  "size": 24810,
  "media_type": "text/csv",
  "role": "predictions_oof",
  "origin_run_id": "r-1a2b3c4d5e",
  "original_path": "prediction_oof.csv",
  "schema_id": "prediction/1",
  "rows": 891,
  "columns": ["id", "prediction"],
  "dependencies": ["<code snapshot sha256>"],
  "retention": "keep",
  "cas_path": ".sa/objects/sha256/ab/12/ab12..."
}
```

Only outputs declared in `run.yaml` are committed. An undeclared file in `output/` is not an
artifact and is not evidence. An output that escapes `output/`, is excessively large, or fails to
hash is rejected by the runner.

## 4. Run manifest

Each run has an immutable manifest at `<workspace>/.sa/manifests/runs/<run_id>.json`, written by the
runner and also appended to the ledger through `run.*` events. The important fields are:

| Field | Content |
|---|---|
| `run_id`, `attempt` | Run identity and retry counter. |
| `objective_id`, `objective_hash` | The locked objective and its semantic hash. |
| `experiment_id`, `hypothesis_ids`, `parent_run_id` | Provenance and lineage. |
| `label`, `status`, `round_id` | Human label, lifecycle state, owning round. |
| `signature` | Idempotency key (see below). |
| `entrypoint` | `{"command": "python main.py", "cwd": "code"}`. |
| `code` | `{"snapshot": "runs/<id>/code", "sha256": "<tree hash>"}`. |
| `env` | `{"python": "...", "lock_sha256": "...", "profile": "cpu-standard"}`. |
| `seed`, `seeds` | The seed for this run and the intended seed set. |
| `inputs` | `[{"dataset_id", "path", "sha256", "role"}]` for every file in `data/public`. |
| `sandbox` | Backend, profile hash, network policy, isolation strength, rlimits. |
| `execution` | Start/end time, exit code, signal, wall seconds, CPU seconds, peak RSS, timeout flag. |
| `outputs` | Artifact records for declared outputs. |
| `metrics` | `{"reported": <parsed metrics.json>}` plus a parse error if unreadable. |
| `trace` | Audit trace path, size, and hash. |
| `cost` | Wall, CPU, peak RSS, and `usd_estimate` (normally 0 for local runs). |
| `error` | Failure reason for failed runs. |

### 4.1 Signature and idempotency

The signature covers:

```text
sha256(canonical_json({
  "objective_hash": "...",
  "code_hash": "...",
  "inputs": [[filename, sha256], ...],
  "env_lock_hash": "...",
  "entry": "python main.py",
  "seed": 42
}))
```

If a run with the same signature has status `finished` or `succeeded`, `sagent run execute` returns the
existing manifest instead of re-running. The runner's `create_run` has a `force_new` parameter, but
neither `api.run_start` nor the CLI exposes it.

The signature does **not** include CLI arguments, hypothesis IDs, labels, or arbitrary parameters.
Two hypotheses that produce byte-identical code, inputs, environment, entrypoint, and seed therefore
collide by design. Vary the code or the seed, or use the Python API with `force_new=True`.

### 4.2 Run lifecycle

```text
require locked objective
  -> require data/public
  -> copy code snapshot (excluding .git, __pycache__, .DS_Store)
  -> symlink frozen inputs read-only
  -> snapshot env lock
  -> compute signature
  -> reuse an identical finished run, or create a new run directory
  -> generate Seatbelt profile
  -> execute with sanitized env and rlimits
  -> capture stdout/stderr and audit trace
  -> commit declared outputs to CAS
  -> write manifest and append run.finished / run.failed
```

`sagent run execute` exits 0 when the run record was created, even if the experiment itself failed.
The failure is in `manifest.status` and `manifest.error`; orchestration should read the manifest or
call `sagent verify`, not parse stdout.

## 5. Workspace layout

```text
<workspace>/
├── .sa/
│   ├── config.toml
│   ├── ledger/
│   │   ├── events.jsonl          # append-only, hash-chained
│   │   └── HEAD                  # {"seq", "hash"}
│   ├── state.json                # rebuildable read model
│   ├── objects/sha256/aa/bb/<sha256>
│   ├── manifests/runs/<run_id>.json
│   ├── envs/<competition>/       # uv venv + env.lock.json
│   ├── locks/ledger.lock
│   ├── private/approvals/<token_hash>.json
│   ├── holdouts.json             # holdout pointer + redacted metadata
│   └── profile.json              # cached data profile
├── data/
│   ├── raw/                      # downloaded files, then frozen read-only
│   ├── public/                   # train/test/sample/holdout_features used by runs
│   └── manifest.json             # frozen dataset hashes
├── experiments/<round>/<hypothesis>/
├── runs/<run_id>/
│   ├── code/
│   ├── inputs/                   # symlinks to data/public
│   ├── output/
│   ├── tmp/
│   ├── home/
│   ├── logs/stdout.log, stderr.log
│   ├── trace.jsonl
│   ├── sandbox.sb
│   ├── _audit/sitecustomize.py
│   ├── verdict.json
│   └── metrics_verified.json
├── reports/
│   ├── latest.md
│   └── rounds/<round_id>/report.md
└── submissions/<submission_id>.csv
```

`data/raw` is chmod read-only by `sagent data freeze`. `data/public` is populated by
`sagent holdout create` (which removes the holdout rows from train) or by `sagent data prepare` (which copies
frozen train/test/sample without a holdout). Runs read only `data/public` through symlinks in
`runs/<run_id>/inputs`.

## 6. Hidden holdout

The holdout labels never live inside the workspace. On macOS, `platformdirs.user_data_dir` resolves
to:

```text
~/Library/Application Support/science-agent/holdouts/<workspace_id>/<holdout_id>/labels.csv
```

The directory is mode `0700`; the labels file is mode `0600`. The workspace stores only a pointer and
metadata in `.sa/holdouts.json`:

```json
{
  "holdout_id": "ho-1a2b3c4d5e",
  "dataset": "train",
  "strategy": "stratified",
  "frac": 0.2,
  "seed": 42,
  "target_column": "target",
  "id_column": "id",
  "group_column": null,
  "time_column": null,
  "public_dir": "data/public",
  "key_path": "/Users/.../holdouts/<workspace_id>/<holdout_id>/labels.csv",
  "rows_train": 712,
  "rows_holdout": 179,
  "sha256_labels": "...",
  "created_at": "...",
  "reveals": []
}
```

Strategies:

| Strategy | Split |
|---|---|
| `stratified` | `train_test_split(stratify=target)` for targets with at most 20 classes; otherwise unstratified. |
| `group` | Deterministic group-level split using the supplied `--group-column` and seed. |
| `time` | Sort by `--time-column`, train on the earlier part, hold out the last `frac`. |
| `auto` | `time` if a time column is supplied, else `group` if a group column is supplied, else `stratified`. |

The holdout is revealed only through a gated verify:

```bash
TOKEN=$(sagent approve --action holdout-reveal --ttl 10 --json)   # human, in a terminal
sagent verify run <run_id> --holdout-token "$TOKEN" --json
```

`sagent verify run` checks the token's action, subject hash, and expiry, and consumes the token. The
subject is `sha256_labels`, so the token is bound to this sealed holdout. Each successful evaluation
appends a `holdout.revealed` event with `run_id` and `score`.

A second L5 evaluation of the same run is refused before the token is consumed. The cap is per run,
not per strategy; create a new holdout for a genuinely new confirmation. Reveals are visible in the
ledger and should be disclosed in the report.

## 7. State briefing

`sagent state briefing --json` is the intended input to the next round. It returns:

```json
{
  "objective": {
    "objective_id": "...", "version": 1, "slug": "...",
    "metric": "roc_auc", "direction": "maximize",
    "status": "locked", "objective_hash": "..."
  },
  "budget": {"max_rounds": 5, "max_runs_per_round": 6, "max_usd": 20.0, "...": "..."},
  "counts": {
    "runs": 12, "verified_runs": 9, "claims": 11,
    "supported_claims": 8, "disputed_claims": 1
  },
  "best_verified_run": {
    "run_id": "r-...", "label": "...", "value": 0.9134, "seeds": 3, "trust": "high"
  },
  "recent_failures": [{"run_id": "...", "label": "...", "error": "...", "signature": "..."}],
  "tested_signatures": ["..."],
  "negative_results": ["Run r-... failed: ..."],
  "public_lb": {"probes_used": 0, "max_allowed": 2},
  "recommended_next": {"policy": "tree", "actions": ["..."]}
}
```

The briefing is assembled from the projection. It is not a place to add interpretation; use the
report for narrative and `sagent search next` for the controller recommendation.

## 8. Threat model

The system is designed for reproducibility and anti-self-deception. It is not a strong security
boundary against hostile code running under the same user ID.

### 8.1 What it is designed to catch

| Failure | Mechanism |
|---|---|
| Fabricated metric | L2 recomputes from OOF predictions and frozen targets; the reported value must match within tolerance. |
| Synthetic-data substitution | L0 checks `cv_design.json` for `data_source: synthetic`, input hashes, and the audit trace. |
| Test-label probing / network access | Seatbelt network denial, sanitized environment, and audit trace of `socket.connect`. |
| Leakage | L3 checks duplicate rows, group overlap, time ordering, and target-derived suspects from the profile. |
| Editing the verifier or ledger | Verifier code is imported from the installed package; the ledger is hash-chained; hooks block common direct edits. |
| Silent deletion of bad runs | Runs are immutable; failed runs are recorded; claims for failures are generated as negative results. |
| Report number drift | Numbers resolve from `metrics_verified` into marked spans; strict checking rejects unmarked numbers. |
| Unapproved submission | Upload requires a short-lived token bound to the submission hash. |

### 8.2 What it does not guarantee

- A same-UID process can read or modify workspace files if filesystem permissions allow it. The
  Seatbelt profile denies specific paths, but it is not a VM or a container.
- The verifier source hash is recorded in the verdict, but there is no remote attestation that the
  installed package is the one you expect.
- The audit trace covers Python `open`, `socket.connect`, `subprocess.Popen`, `os.system`, and
  `os.exec` events. A shell entrypoint, native extension, or deliberately evasive code can have
  `trace_coverage: partial` or no trace at all.
- The memory cap is best-effort on macOS; see `docs/limitations.md`.
- A determined agent could construct a run whose declared outputs pass the checks while the
  scientific claim is still wrong. Verification checks executability, provenance, metric
  consistency, and design; it does not prove the hypothesis is true.

### 8.3 Trust levels

A verdict is `fail` if any check has status `fail`, `warn` if any check has status `warn` and none
fail, and `pass` otherwise. `skip` does not fail a verdict.

`trust` is:

| Verdict | Isolation | Trust |
|---|---|---|
| `pass` | `strong` (Seatbelt) | `high` |
| `pass` or `warn` | any | `medium` |
| `fail` | any | `low` |

`strong` isolation means `/usr/bin/sandbox-exec` was available and the generated profile was used.
Portable fallback runs are `weak` and cannot reach `high` trust. The report should state the trust
level and the warnings behind it.

## 9. Invariants

1. The ledger is append-only; a rewrite is detectable.
2. Artifacts are addressed by content hash; a changed artifact is a different artifact.
3. A run manifest is written once and is not edited by the worker.
4. A verdict is written by `sagent verify`, not by the agent that wrote the code.
5. A claim is `supported` only with passing or warning verdict IDs.
6. Report numbers resolve from verified state into marked spans.
7. Submission is an explicit external write behind a human approval token.
8. The hidden holdout is outside the workspace and is accessed only through a gated verify.
