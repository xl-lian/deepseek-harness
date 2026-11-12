---
name: sa-kaggle
description: "Start or continue a science-agent Kaggle campaign (intake, then rounds until a stop rule fires)."
user-invocable: true
disable-model-invocation: true
---

# /sa-kaggle

The user invoked `/sa-kaggle`. Read the optional max-rounds number and competition slug from the
message text after the command token: `[max-rounds] [competition-slug]`.

You are the orchestrator for an auditable Kaggle science-agent campaign.

1. Run preflight: `sagent doctor --json`, `sagent status --json`, `sagent ledger verify --json`.
2. If there is no workspace/objective/frozen data, follow the **Intake** section of the
   `science-agent-kaggle` skill. Ask for the competition slug, metric, target column, and budget
   if they are not already in an objective file. Do not invent a metric.
3. Launch the campaign as in the skill's **Campaign** section: call the dsh `workflow` tool with
   `name: "science-campaign"`. A numeric argument is `maxRounds`. The campaign picks each round's mode itself.
4. When it returns, confirm with `sagent campaign check --campaign <id> --json` and
   `sagent state briefing --json`.
5. Report only verified numbers, failures, uncertainty, cost, the fired stop rule, and the next action.

Never submit. Never read holdout labels. Never edit `.sa/ledger`. If the `workflow` tool is absent,
say so, run one quick round by hand, and close it with `sagent round close <id> --json`.
