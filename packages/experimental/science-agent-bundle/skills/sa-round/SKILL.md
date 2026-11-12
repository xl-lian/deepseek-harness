---
name: sa-round
description: "Run exactly one science-agent round (scout, hypotheses, selection, experiments, verification, close)."
user-invocable: true
disable-model-invocation: true
---

# /sa-round

The user invoked `/sa-round`. Read the optional mode from the message text after the command token:
`[quick|full|debug]`; default: `next_mode` from `sagent campaign check --json`, else `full`.

1. Preflight: `sagent status --json`; stop if the objective is not locked or data is not frozen.
2. `sagent round begin --mode <mode> --controller tree --json`; capture `round_id`.
3. Call the dsh `workflow` tool with `name: "science-round"` and args `{workspace, roundId, mode, saBin,
   templatesDir, maxHypotheses, maxRuns, runTimeoutSec}` from the objective budget.
4. Post-round, in this session, exactly one deterministic command:
   `sagent round close <round_id> --json`
   (decide, claim sync, report build + strict check, verify design, stage marks, outcome, round end).
5. If `report.strict_ok` is false, do not disable strict mode. Remove the unsourced number or replace
   it with a verified slot.
6. Summarize: outcome, best verified result (metric, seeds, trust), failures, negative results, dropped
   candidates, cost, next recommendation. Do not call Kaggle submit.
