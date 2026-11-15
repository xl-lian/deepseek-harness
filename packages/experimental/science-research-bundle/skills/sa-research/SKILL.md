---
name: sa-research
description: "Research an open question with science-agent's research loop (retrieve, plan, experiment, validate, next step) until the next-step node stops it."
user-invocable: true
disable-model-invocation: true
---

# /sa-research

The user invoked `/sa-research`. The message text after the command token is either a research question
for a new workspace or a number of rounds to continue an existing one.

Follow the `science-research` skill.

1. Preflight: `sagent doctor --json`, `sagent ledger verify --json`, `sagent domain show --json`.
2. If there is no workspace or no research objective, do the skill's **Intake**: take the question from the
   message or the conversation (never invent one), draft `objective.yaml` from the example objective, create
   and lock it, and run `sagent env init --profile research`. Ask before granting network access or naming an
   API key in `research.resources`. If the workspace has a metric objective (`control: metric`), say that this
   profile runs research objectives only and stop.
3. Call the dsh `workflow` tool with `name: "research-loop"` and args `{workspace, saBin, maxRounds,
   runTimeoutSec}`. A numeric argument is `maxRounds`. Do not run nodes by hand first.
4. When it returns, write `result.report.markdown` verbatim to `research/report.md` and record it with
   `sagent -w <workspace> research record --round <result.report.round_id> --node write-up --file research/report.md --json`.
   Then read `research/report.md`, `research/state.md`, and `sagent -w <workspace> research status --json`.
5. Report in the skill's **Reporting** shape, including why the loop stopped.

Never edit `.sa/` or `runs/`.
