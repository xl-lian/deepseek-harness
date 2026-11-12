---
name: sa-submit
description: "Validate and prepare a Kaggle submission; never uploads without a human approval token."
user-invocable: true
disable-model-invocation: true
---

# /sa-submit

The user invoked `/sa-submit`. Read the run id from the message text after the command token.

1. Verify the run first: `sagent verify run <run-id> --json`. If it is not pass/warn, stop.
2. Validate the file: `sagent submit validate runs/<run-id>/output/submission.csv --json`.
3. Ensure a decision exists and chose this run: `sagent decide --round <round-id> --json`.
4. Prepare: `sagent submit prepare --run <run-id> --decision <decision-id> --json`.
5. Show the user: submission id, file hash, validation result, verdict trust, and the exact terminal
   command to approve:
   `sagent approve --action submit --ttl 10 --json`
   Then, only after the user explicitly confirms and provides the token:
   `sagent submit upload --submission <id> --approval-token <token> --message "..." --json`

Never run the approval or upload yourself on your own initiative. Never probe the public LB to
select a model. If the submission limit is reached, stop and report it.
