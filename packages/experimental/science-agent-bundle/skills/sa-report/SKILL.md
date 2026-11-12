---
name: sa-report
description: "Build and audit the traceable science-agent report."
user-invocable: true
disable-model-invocation: true
---

# /sa-report

The user invoked `/sa-report`. Read the optional round id and `--final` flag from the message text
after the command token.

1. Build:
   - round report: `sagent report build --round <round-id> --json`
   - final report: `sagent report build --json`
2. Check: `sagent report check <path> --strict --json`. If it fails, list each unsourced token and line.
   Do not disable strict mode and do not guess a number.
3. Read `sagent state briefing --json` and `sagent claim audit --json`.
4. Present: report path, ledger anchor, best verified result, negative results, disputed claims,
   holdout status, submission status, cost, and next action.

Every number you repeat must come from the report or the JSON outputs. Public LB scores must be
labeled external/unverified and never combined with CV.
