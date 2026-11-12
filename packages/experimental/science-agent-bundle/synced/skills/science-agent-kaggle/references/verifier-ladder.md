# Verifier ladder

Verification is layered so that a failure is attributed to the right question. Each layer is
implemented in `science_agent.verifiers`; metric recomputation is implemented in
`science_agent.metrics` without importing the experiment environment.

## 1. Overview

| Layer | Question | Pass criteria | Blocking? | What it cannot prove |
|---|---|---|---|---|
| L0 | Did the run produce the declared interface from the declared inputs? | Manifest parses, required outputs exist, hashes match, inputs match frozen data, no synthetic substitution, no network, no credentials, predictions are well-formed. | Yes | That the code is correct, that the metric is right, or that the design is valid. |
| L1 | Did it execute cleanly and reproducibly? | Exit code 0, no timeout, finite predictions, artifact hashes stable, resources within caps. Deterministic rerun is a warning, not a failure. | Yes | That the result generalizes or that the CV is honest. |
| L2 | Is the reported metric the metric of the produced predictions? | Recomputed metric matches the reported value within tolerance, direction is correct, OOF coverage is complete, per-fold scores match. | Yes | That the metric suits the competition, or that leakage is absent. |
| L3 | Is the validation design credible? | Time/group structure respected, no duplicate/target/group/time leakage, a baseline exists, seed count is adequate, improvement exceeds the declared minimum delta, public LB was not used. | Final claim: yes; some checks are warnings | That the model will generalize to the private test set, or that multiple comparisons were corrected. |
| L4 | Is this a legal competition submission? | Submission columns and IDs match the sample, metric matches the objective, external data is allowed if used. | At submission: yes | That Kaggle rules were accepted in the browser, that the private LB will agree, or that test labels were not probed by some path outside the trace. |
| L5 | Does the result survive the sealed holdout? | Holdout unchanged, a valid approval token is supplied, predictions cover the holdout, and the score is recorded. | At submission: yes | That the private LB will match, or that a single held-out split is sufficient evidence. |

The aggregate verdict is `fail` if any check has status `fail`, `warn` if any check has status
`warn` and none fail, and `pass` otherwise. A `skip` does not fail a verdict. `severity` labels a
check's importance for reporting; the aggregate is driven by `status`.

`trust` is `high` only when the verdict is `pass` and the run used strong isolation, `medium` for a
non-failing verdict in weak isolation, and `low` for a failing verdict. See
`references/architecture.md` §8.3.

## 2. L0 — interface and provenance

| Check ID | Severity | Pass criteria |
|---|---|---|
| `schema.run_manifest` | blocking | The manifest parses and `manifest.run_id == run_id`. |
| `outputs.declared` | blocking | The manifest declares all of `metrics`, `predictions_oof`, `folds`, `cv_design`. `prediction_test.csv`, `holdout_predictions.csv`, and `submission.csv` are declared optional in the default `run.yaml`. |
| `code.hash` | blocking | `sha256_tree(runs/<run_id>/code)` equals `manifest.code.sha256`. |
| `data.provenance` | blocking | Every manifest input exists in `data/public` and hashes to its recorded SHA-256. |
| `data.no_synthetic_substitution` | blocking | `cv_design.json` does not declare `data_source: synthetic`. If an audit trace exists and never opened `train.csv`, the check warns. With no trace, it passes. |
| `source.no_network` | blocking | No `socket.connect` events unless the manifest explicitly allowed network. Allowed network produces a warning. No trace produces a warning. |
| `source.no_credentials` | blocking | No match for `KAGGLE_KEY`, `KAGGLE_USERNAME`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, or `ssh-rsa` in `logs/stdout.log`, `logs/stderr.log`, or `trace.jsonl` (first 2 MB of each). |
| `predictions.schema` | blocking | `prediction_oof.csv` is non-empty and its IDs are unique. |
| `predictions.range` | blocking | Predictions are finite. For canonical `roc_auc` and `log_loss`, values lie in `[0, 1]`. |
| `sandbox.isolation` | warn (severity blocking) | The run used strong isolation. Weak isolation is a warning, not a failure, but it caps trust at `medium`. |

L0 cannot prove that the code used the data honestly. It proves that the declared interface exists
and that the bytes match the frozen inputs. A run can satisfy L0 while computing a scientifically
meaningless quantity.

## 3. L1 — executability

| Check ID | Severity | Pass criteria |
|---|---|---|
| `exit_code` | blocking | `manifest.execution.exit_code == 0`. |
| `timeout` | blocking | `manifest.execution.timed_out` is false. |
| `no_nan_inf` | blocking | OOF predictions parse and are finite. |
| `artifact.hashes` | blocking | Every manifest output with an `original_path` exists in `output/` and matches its recorded SHA-256. |
| `resource.caps` | major (warn) | Wall time does not exceed the recorded CPU rlimit. |
| `deterministic_rerun` | major (warn) | Only with `--rerun`. A second run's reported metric is within `max(1e-6, 1e-4 * abs(reported))` of the first. A mismatch or rerun failure is a warning. |

`--rerun` is expensive. The workflow does not request it; use it for an audit or a suspicious result.
A rerun mismatch is a warning because some legitimate pipelines are mildly nondeterministic, but it
must be disclosed and is a reason not to promote a final claim without further seeds.

## 4. L2 — metric recomputation

| Check ID | Severity | Pass criteria |
|---|---|---|
| `oof.coverage` | blocking | Every train ID appears exactly once across the OOF predictions; the OOF ID set equals the train ID set. |
| `metric.recompute` | blocking | The metric recomputed from `prediction_oof.csv` plus frozen targets matches `metrics.json` within tolerance. |
| `metric.direction` | blocking | The direction in `metrics.json` (defaulting to the objective) equals the objective direction. |
| `fold.consistency` | blocking | If `metrics.json` contains `fold_scores` and `folds.csv` exists, each reported fold score matches the recomputed score for that fold. If either is absent, the check is `skip`. |

Tolerance is:

```text
|reported - recomputed| <= max(1e-6, 1e-4 * |recomputed|)
```

`metrics.json` may use `value` or `metric_value` for the headline number, and
`metric_name`/`direction` to override the objective for this run. The verifier uses those fields,
then checks the direction against the objective.

Supported metrics are ROC AUC, log loss, accuracy, precision, recall, F1, RMSE, MAE, R², MAPE, SMAPE,
RMSLE, quadratic weighted kappa, Pearson, Spearman, and mean column-wise RMSE (`mcrmse` is defined but
not registered in the computer table, so it is currently unsupported). An unsupported metric makes
`metric.recompute` fail with a blocking error. The system never accepts an experiment-defined metric
as truth.

### Custom metric (packing and code competitions)

When the objective sets `competition.metric.recompute` (a workspace-relative Python file), L2 ignores
the OOF path. The file must define `recompute(context)` and return
`{metric_name, direction, value, n, errors, invalid, warnings, details}`; the verifier passes the
submission path, optional `data/public/solution.csv`, the data directory, and the objective. It
never imports experiment code.

| Check ID | Severity | Pass criteria |
|---|---|---|
| `metric.scorer_pinned` | blocking when pinned | `sha256(metric.recompute)` equals `recompute_sha256`; without a pin the check warns. |
| `metric.identity` | blocking | The returned metric name and direction equal the objective's. |
| `submission.schema` | blocking | The scorer returns no structural `errors`. |
| `submission.feasible` | blocking | The scorer rejects none of the submitted items (`invalid` is empty). |
| `submission.warnings` | minor | Warnings surface without failing the verdict. |
| `metric.recompute` | blocking | The recomputed value matches `metrics.json` within the tolerance above. |

A scorer edited after the objective was locked fails `metric.scorer_pinned`; updating it is a human
`objective update`, never an agent edit. A verdict with rejected items has no `metrics_verified`
value, so `sagent decide` cannot rank it. In this mode L3 skips the CV and leakage checks (there is
no labelled split), compares the exact certified score to the baseline using `min_delta`, and L5
reports `holdout.not_applicable`.

L2 proves internal consistency: the number in `metrics.json` is the number produced by the OOF
predictions against the frozen targets, or by the pinned scorer against the submission. It does not
prove that the metric is the competition's metric (L4 checks that), that the CV split is honest (L3),
or that the model is good.

## 5. L3 — research design and leakage

L3 uses the cached profile at `.sa/profile.json` and the per-run `folds.csv` and `cv_design.json`.
`sagent data profile` should be run before L3; without a profile, the leakage-suspect and CV-scheme
signals are weaker.

| Check ID | Severity | Pass criteria |
|---|---|---|
| `cv.design_present` | blocking | `cv_design.json` exists. |
| `cv.scheme_matches_data` | blocking | If the profile found time columns, the strategy is one of `time`, `time_series_split`, `rolling`, `holdout`. If it found group candidates but no time columns, a non-group strategy produces a warning. Other cases pass. |
| `leakage.target_derived_feature` | blocking | The profile found no feature with absolute correlation at least 0.995 with the target. |
| `leakage.duplicate_rows` | blocking | No group of rows with identical feature values (excluding target and ID) spans more than one fold. `skip` if `folds.csv` is missing, pandas is unavailable, or the check cannot run. |
| `leakage.group_overlap` | blocking | If `cv_design.json` names a group column, no group appears in more than one fold. |
| `leakage.time` | blocking | If `cv_design.json` names a time column, for every fold the maximum training time is strictly less than the minimum validation time. |
| `baseline.present` | blocking | The run is labeled baseline, or a baseline run exists. Otherwise a warning. |
| `seeds.count` | warn (severity blocking) | The recorded seed count is at least `objective.constraints.require_seed_runs` (default 3). Fewer seeds is a warning, not a failure. |
| `seeds.variance` | minor | Reports the standard deviation of fold scores when at least two exist. Informational. |
| `improvement.exceeds_noise` | major | The direction-adjusted delta versus the verified baseline is greater than `max(observed fold SD, objective.constraints.min_delta)`. Otherwise a warning. |
| `public_lb_not_used` | major | No submission has status `uploaded` or `scored`. Otherwise a warning. |

### 5.1 Leakage checks in detail

- **Duplicate rows.** After merging train and folds on the ID column, rows with identical feature
  values (all columns except target and ID) are grouped. If a group has more than one distinct fold,
  the check fails. This catches exact or near-exact duplicates that straddle train and validation.
- **Target leakage.** The profile flags numeric features whose absolute correlation with the target is
  at least 0.995. Any such suspect fails L3. This is a heuristic; a legitimate near-deterministic
  feature can trigger it and must be investigated rather than silently removed after seeing the score.
- **ID leakage.** The profile records `id_candidates` (columns named `id`, `row_id`, `index`, or
  `*_id` with unique values), but L3 does not currently add an ID-feature check. Treat ID columns as
  exclusions in `main.py`; a leaky ID feature will not be caught automatically.
- **Time leakage.** The check requires `cv_design.json` to name a time column, and the fold artifact
  to contain that column. For each fold, the latest training timestamp must be earlier than the
  earliest validation timestamp. A random split on time-ordered data fails this check.
- **Group leakage.** The check requires `cv_design.json` to name the group column and the merged
  frame to contain it. Any group spanning folds fails. This is the machine-checkable reason
  `folds.csv` is a required output.

### 5.2 Seed variance, baseline, and multiple comparisons

`seeds.count` counts the distinct seeds that finished for the candidate (its experiment, else its
label). `seeds.variance` reports the fold-score standard deviation. The decision step does not use
fold SD to reject a candidate; it uses the SD of the candidate's seed-level means.

`sagent verify design --round <id>` produces a round-level view:

```json
{
  "round_id": "rd-...",
  "verified_runs": [{"run_id": "...", "label": "...", "value": 0.91, "seeds": 3}],
  "baseline_run_id": "r-...",
  "baseline_value": 0.88,
  "best": {"run_id": "...", "value": 0.91},
  "delta_vs_baseline": 0.03,
  "groups": [{"key": "x-...", "run_id": "...", "mean": 0.91, "sd": 0.004, "n": 3, "seeds": 3}],
  "multiple_comparisons": {"m": 3, "alpha": 0.1, "z": 1.83},
  "note": "LLM interpretation is a soft signal; verdicts above are code-derived."
}
```

`multiple_comparisons` reports the Bonferroni-corrected bar used by `decide` and `round close`: `m` is
the number of candidates tried in the round (including those screened out), and the winner must beat
the reference by more than `max(min_delta, z * SE)`, with one-sided alpha 0.10 across the round. SE is
paired by seed when at least two seeds are shared, otherwise unpaired. This uses a normal critical
value, which is optimistic with only a few seeds.

### 5.3 Public leaderboard prohibition

The objective defaults `no_public_lb_search: true`. L3 warns when any submission has been uploaded
or scored. The decision step does not currently inspect probe timing, so a run selected after a
public-LB probe is not automatically rejected. The policy is enforced by process and by the skill
instructions, not by a hard code gate. Never use public LB feedback to choose a model, feature, or
CV change. Public LB scores are external, unverified evidence; they never support a generalization
claim.

### 5.4 Seed independence

`sagent decide` counts distinct OOF prediction hashes, not run count. Three runs that emit byte-identical
`prediction_oof.csv` are one effective seed and are labelled "not independent seeds"; a single-seed
claim is not promoted when `require_seed_runs` is higher. Make model seeds actually change the fitted
predictions, or vary data order/feature subsampling, before treating runs as replication.

## 6. L4 — competition interface

L4 runs with the normal ladder and is most relevant at submission time.

| Check ID | Severity | Pass criteria |
|---|---|---|
| `submission.format` | blocking | If `output/submission.csv` and `data/public/sample_submission.csv` exist, columns match exactly, the ID set equals the sample's, and IDs are unique. `skip` if no submission file. |
| `competition.metric_match` | blocking | The canonical objective metric equals the canonical workspace metric (which defaults to the objective metric). |
| `rules.external_data` | major | If `allow_external_data` is false, no dataset in `data/manifest.json` has role `other`. Otherwise a warning. |

L4 does not verify that competition rules were accepted in the browser, that the submission count is
within Kaggle's daily limit, or that an external dataset was legally used. Those are human checks and
the upload gate. L4 also does not prove the absence of test-label probing by a path the audit trace
did not observe; network denial and trace coverage are the available evidence.

## 7. L5 — hidden holdout

L5 runs when `L5` is in `--levels` or when `--holdout-token` is supplied.

| Check ID | Severity | Pass criteria |
|---|---|---|
| `holdout.evaluate` | blocking | A holdout is configured; a valid `holdout-reveal` token is supplied; the labels file still hashes to `sha256_labels`; `output/holdout_predictions.csv` covers every holdout ID; the metric computes. |

- With no holdout configured, the check is `skip`.
- With no token, the check fails: `holdout evaluation requires an approval token`.
- A bad token fails with the reason from `verify_approval`: unknown, wrong action, wrong subject, or
  expired.
- If the labels file is missing or its hash changed since sealing, the check fails.
- If `holdout_predictions.csv` is missing or covers fewer IDs than the labels, the check fails.
- A successful evaluation appends `holdout.revealed` with the score. Every call appends a new
  reveal.

The token is created in a terminal:

```bash
TOKEN=$(sagent approve --action holdout-reveal --ttl 10 --json)
sagent verify run <run_id> --holdout-token "$TOKEN" --json
```

`sagent verify run` also accepts `--levels L0,L1,L2,L3,L4,L5` without a token, in which case L5 fails
with the missing-token message. The MCP server does not expose holdout reveal; run it in a terminal.

**One-reveal rule.** The intended policy is one approved reveal per holdout. The current code records
every reveal but does not enforce a cap. Treat the first reveal as final, disclose any repeat in the
report, and prefer a new checkpointed holdout for a genuinely new confirmation.

## 8. Evidence levels

The research reports define evidence levels V0–V4. They are useful for describing what a result can
support, and they are not a substitute for the ladder.

| Level | Meaning | In this system |
|---|---|---|
| V0 | Output or demonstration; no systematic verification | An agent's narrative, a plan, an unreviewed notebook. |
| V1 | Retrospective evaluation on historical data or a public benchmark | A single CV score without leakage checks or a baseline. |
| V2 | Machine-checkable evidence: held-out data, external execution, a formal verifier | L0–L3 plus a sealed holdout evaluated by package code. |
| V3 | Real-world prospective validation by the original team | Not achievable in a Kaggle workspace. |
| V4 | Independent external reproduction | Not achievable by this system. |

A clean L0–L3 result on a Kaggle CV is V2-like for a local computation. It is not V2 for the
competition's private test set, and public LB is not ground truth. An LLM judge is V0/V1 at best for
factual claims and is never evidence of correctness.

## 9. What the ladder cannot prove

- That the competition metric is the right scientific objective.
- That the CV split matches the private test distribution.
- That a small improvement is not the result of many comparisons.
- That a model selected after seeing public LB will generalize.
- That a claim about the real world is true; the system verifies computations, not nature.
- That a same-UID adversary did not tamper with the environment outside the recorded checks.

Use the report's claim status, trust level, warnings, seed count, and holdout result together. A
passing verdict is a statement about the run, not about the hypothesis.
