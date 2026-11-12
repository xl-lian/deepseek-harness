---
name: sa-campaign
description: "Run a science-agent campaign in any domain pack (predictive, scored, equation) until a stop rule fires."
user-invocable: true
disable-model-invocation: true
---

# /sa-campaign

The user invoked `/sa-campaign`. Read the optional max-rounds number from the message text after the
command token.

1. Preflight: `sagent doctor --json`, `sagent status --json`, `sagent ledger verify --json`,
   `sagent domain show --json`. If the objective is not locked or data is not frozen, follow the
   **Intake** section of the `science-agent` skill and stop.
2. Call the dsh `workflow` tool with `name: "science-campaign"` and args `{workspace, saBin, maxRounds,
   roundArgs: {maxHypotheses, maxRuns, runTimeoutSec, templatesDir}}`.
3. Confirm from state: `sagent campaign list --json`, `sagent campaign check --campaign <id> --json`.
4. Report rounds with mode and outcome, the best verified result, failures, uncertainty, cost, the
   fired stop rule, and report paths.

Never submit. Never reveal the holdout. Never edit `.sa/ledger`.
