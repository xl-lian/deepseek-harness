# Reporting and claims

A report is a view of verified state, not a narrative written from memory. The builder reads the
ledger projection, verdicts, and artifacts; it resolves numbers into marked spans; and the strict
checker rejects numbers that have no source.

## 1. Claims

A claim is a precise statement with a scope, a status, evidence, and optional verdict IDs. The model
stores `type` as a free string. These conventions are used by the skill and the generated claims:

| Type | Meaning | Typical evidence | Can a run verdict promote it? |
|---|---|---|---|
| `literature_fact` | A statement about published work or competition documentation. | `literature` evidence with URL and quote; quality `external_unverified` or `soft`. | No. A run verdict checks a computation, not a paper. |
| `data_result` | A measured result from a run on this dataset and CV design. | `verdict` evidence, quality `verified`. | Yes. This is what `sagent claim sync` creates. |
| `method_result` | A statement about the chosen method within the round's candidate set and budget. | `verdict` evidence plus the decision. | Yes, within the stated scope. |
| `synthesis` | A combination of multiple results or sources. | Multiple evidence IDs. | Not directly; the synthesis is only as strong as its parts. |
| `causal` | A causal statement, not merely an association. | An intervention or design that isolates the cause. | A CV score alone does not support it. |
| `novelty` | A claim that an approach or finding is new. | Literature search and explicit comparison. | No. Novelty needs external review. |
| `negative_result` | A failed run or a refuted approach. | `run` evidence, quality `verified`. | It is recorded as supported by the failure record. |

Use the narrowest type that fits. A CV improvement is a `data_result` or `method_result`, not a
`synthesis` or a `causal` claim. A public LB score is not a `data_result`; it is external,
unverified evidence.

### 1.1 Evidence quality

`sagent evidence add` accepts evidence types `run`, `verdict`, `literature`, `data`, `doc`, and `note`;
relations `supports`, `contradicts`, and `neutral`; and quality `verified`, `external_unverified`, or
`soft`.

| Quality | Use |
|---|---|
| `verified` | A verdict, a run manifest, or a frozen-data check produced by the package. |
| `external_unverified` | A public LB score, a competition page, or a third-party claim that has not been reproduced locally. |
| `soft` | An LLM judgment, an unverified literature card, or a heuristic. Never treat it as proof. |

### 1.2 Claim lifecycle

The statuses are `unverified`, `supported`, `refuted`, `disputed`, and `superseded`.

- `sagent claim add` creates an `unverified` claim. It does not promote it.
- `sagent claim sync --round <id>` creates deterministic claims from verified runs, failed runs, and the
  decision, and promotes the generated claims. This is the normal path.
- Promotion requires at least one verdict ID whose verdict is `pass` or `warn`. A `fail` verdict
  cannot support a claim.
- A conflict is not resolved by overwriting. Both sides become `disputed`, and the reason is kept.
- A superseded claim remains in the ledger; the replacement points at it.

The CLI exposes `claim add`, `claim list`, `claim audit`, and `claim sync`. The Python module also has
`promote_claim`, `dispute_claim`, and `supersede_claim`, but there are no `sagent claim promote`,
`sagent claim dispute`, or `sagent claim supersede` subcommands in the current `cli.py`. For a manual claim
that needs promotion, use `sagent claim sync` for generated claims or extend the CLI rather than editing
state.

`sagent claim audit` flags claims with missing evidence IDs and supported claims without verdicts. A
`negative_result` is exempt from the verdict requirement because its evidence is the failure record.

## 2. Report slots

The builder resolves slot expressions from verified state. Unknown slots, missing sources, and
hash mismatches raise an error rather than rendering a placeholder.

| Slot | Resolves to |
|---|---|
| `{{anchor:0}}` | `seq=<marked seq> hash=<head hash>`. The argument is ignored; the current head is used. |
| `{{metric:RUN:FIELD}}` | A verified metric. `FIELD` is `value` or `mean` for the headline value, or `sd`/`std` for the fold-score standard deviation. |
| `{{ci:RUN:value:95}}` | A normal interval `value ± z * sd`; `z = 1.96` for level `95`, otherwise `1.645`. Requires a verified value and at least two fold scores. |
| `{{claim:CLAIM_ID}}` | The claim statement, with numeric tokens wrapped in marked spans. |
| `{{table:verified_runs}}` | A table of runs with a verified metric: run, label, metric, value, seeds, verdict, trust. |
| `{{table:negative_results}}` | A table of failed and timed-out runs with their error text. |
| `{{table:verdicts:RUN}}` | The check table for one run's verdict. |
| `{{curve:objective}}` | The best-so-far table: run, label, value, best so far. |
| `{{holdout:RUN:metric}}` | The holdout score recorded in the run's verdict. |
| `{{cost:objective}}` | Run count and total wall time. |

A number that has no slot is not a report number. Write the slot, not the value.

## 3. Marked spans and the strict number check

Resolved values are wrapped:

```html
<!--sa:r-1a2b3c4d5e:value-->0.913400<!--/sa-->
```

The key is a stable source key, such as `<run_id>:value` or `claim:<claim_id>:1`. The value inside is
formatted by the builder (floats to six decimals). The span is the provenance marker: it says which
source produced the number.

`sagent report check <path> --strict` (also available as `sagent verify report <path> --strict`) scans the
document outside fenced code blocks and:

- removes marked spans, inline code, URLs, dates, and ID tokens of the form
  `r-...`, `v-...`, `c-...`, `e-...`, `a-...`, `obj-...`, `h-...`, `x-...`, `d-...`, `rd-...`,
  `s-...`, `ho-...`;
- reports unresolved `{{...}}` slots;
- reports every remaining numeric token;
- exempts the literals `-1`, `0`, and `1` in table rows or list items.

Exit codes:

| Command | Behavior |
|---|---|
| `sagent report check <path> --strict` | Exit 3 if any issue; prints `{ok, strict, issues, path}`. |
| `sagent report check <path> --no-strict` | Reports issues but returns `ok: true`. Do not use for a final report. |
| `sagent verify report <path> --strict` | Same as `report check`; exit 3 on issues. |
| `sagent report build --round <id>` | Builds the report, runs the strict check, and returns the path, anchor, and `checks`. It does **not** exit nonzero when `checks.ok` is false. Read the checks or run `report check` explicitly. |

The current template is fully slotted, so a normal build usually passes. A hand-edited or extended
template is where failures appear. A failure is a provenance bug: either remove the number or replace
it with a slot that resolves from verified state. Do not disable strict mode for a final report and
do not guess the value.

## 4. Report sections

`sagent report build --round <round_id>` writes `reports/rounds/<round_id>/report.md`.
`sagent report build` without `--round` writes `reports/latest.md`. The current template contains:

1. **Title and generated timestamp.**
2. **Ledger anchor** (`{{anchor:0}}`).
3. **Objective**: competition, metric and direction, objective version, budget/cost slot.
4. **Verified runs**: the `verified_runs` table.
5. **Best-so-far**: the `curve` table.
6. **Decision**: chosen run, rationale code, candidate and eliminated counts.
7. **Claims**: supported, disputed, and refuted claims, with marked numbers.
8. **Negative results**: failed and timed-out runs.
9. **Validation design**: a pointer to per-run CV and leakage checks in the verdict tables.
10. **Submission**: prepared/uploaded/scored submissions, public score if recorded, and the explicit
    statement that public LB is external and unverified.
11. **Provenance**: ledger anchor, data manifest path, and the rule that unmarked numbers are
    rejected.

The template does not currently include every section from an earlier design, such as data hashes,
environment locks, a holdout table, an AI review, or a limitations section. Add them by extending
`report.py` and using slots; do not hand-write unsourced numbers into a build.

## 5. Ledger anchor

The anchor is a `{seq, hash}` pair:

```bash
sagent ledger anchor --json
# {"seq": 128, "hash": "3d7e..."}
```

It identifies a point in the hash chain. Because each event commits to the previous hash, the anchor
also commits to the entire history before it. A report embeds the anchor so a reader can tell when
the report was generated and which ledger state it saw.

To explain an anchor:

```bash
sagent report explain 128 --json
sagent ledger explain 3d7e... --json
```

Both resolve to the event at that sequence or hash and the previous event:

```json
{
  "event": {"seq": 128, "type": "report.generated", "payload": {"...": "..."}, "hash": "3d7e..."},
  "prev": {"seq": 127, "type": "decision.recorded", "hash": "...", "prev_hash": "..."}
}
```

A useful explanation has four steps:

1. Name the event type and sequence.
2. Show the payload fields that matter (for example, the chosen run or the report path).
3. Show the previous event and verify the chain with `sagent ledger verify`.
4. Follow the payload's hashes to artifacts in `.sa/objects/sha256/...` and to the run manifest.

If `sagent ledger verify` fails, stop. A report whose anchor does not verify is not evidence.

## 6. LLM judgment is a soft signal

An LLM review can help find omissions, propose counterexamples, or improve readability. It is not
evidence.

- It has no verdict ID and cannot promote a claim.
- It must be labeled `soft` evidence or described as a review, not a result.
- It must never be used to select a model, a feature, or a CV change.
- `sagent verify design` returns the note: "LLM interpretation is a soft signal; verdicts above are
  code-derived."
- There is no `sagent judge add` subcommand in the current CLI. If you record a review, use
  `sagent evidence add --type note --quality soft` and state that it is not evidence.

The same rule applies to the statistician agent: its L3 review is a narrative over deterministic
checks, not an override.

## 7. Public leaderboard language

Public LB numbers are external and unverified:

- Label them `external_unverified`.
- Never merge them with CV in one comparison or one table.
- Never use them to support a generalization claim.
- Never use them to choose a model, feature, or threshold.
- Report the probe index and the number of probes used against the allowed maximum.

The report template already adds this sentence after submission entries:

> Public LB scores are external and unverified; they never support a generalization claim.

## 8. Example

```markdown
# Science-Agent Report — Playground — binary target

Generated: 2026-10-26T12:00:00.000Z
Ledger anchor: `seq=<!--sa:anchor:seq-->128<!--/sa--> hash=3d7e...`

## Objective

- Competition: playground-series-s6e1
- Metric: **roc_auc** (maximize)
- Objective version: <!--sa:objective:version-->1<!--/sa-->
- Budget: <!--sa:cost:runs-->12<!--/sa--> runs, <!--sa:cost:wall-->1840.2<!--/sa--> s wall clock

## Verified runs

| run | label | metric | value | seeds | verdict | trust |
|---|---|---|---|---|---|---|
| r-1a2b3c4d5e | baseline | roc_auc | <!--sa:r-1a2b3c4d5e:value-->0.881234<!--/sa--> | <!--sa:r-1a2b3c4d5e:seeds-->3<!--/sa--> | pass | high |

## Decision

Chosen run: `r-1a2b3c4d5e` (best_verified_mean). Candidates: 4; eliminated: 2.
```

Every numeric token in the rendered report is inside a marked span. The strict check should return
`{"ok": true, "issues": []}`.

## 9. Common strict-check failures

| Symptom | Cause | Fix |
|---|---|---|
| A number in a prose paragraph is flagged. | It was typed manually. | Replace it with a slot or remove it. |
| A number in a table is flagged. | The table was hand-edited without marked spans. | Use `{{table:...}}` or wrap the value with a builder-generated mark. |
| A date is flagged. | The checker exempts `YYYY-MM-DD` but not every format. | Use an ISO date or move it into a code span. |
| An unresolved `{{...}}` remains. | The slot name or argument is wrong. | Use a slot from §2; read the error for the unknown slot. |
| A claim statement flags a number. | The claim was inserted without `_mark_numbers`. | Use `{{claim:ID}}`; the builder marks its numeric tokens. |
| `report build` returns `checks.ok=false` but exits 0. | Build reports checks but does not raise. | Run `sagent report check <path> --strict` and act on exit 3. |
