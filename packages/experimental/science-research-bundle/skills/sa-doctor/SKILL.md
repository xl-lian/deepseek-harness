---
name: sa-doctor
description: "Check the science-agent toolkit, sandbox, disk, Kaggle credentials, ledger, and workspace."
user-invocable: true
disable-model-invocation: true
---

# /sa-doctor

Run:

```bash
sagent doctor --json
sagent ledger verify --json
sagent sandbox selftest --json
sagent domain show --json
```

For a research workspace (`control: prompt`) also run `sagent research status --json`; for a Kaggle
competition also run `sagent plugin status --json`.

Report each check as pass/warn/fail. Explain the fix for failures:
- missing `sagent`, or no `research` command: install the toolkit 0.4.1 or later
  (`uv tool install --force "science-agent-toolkit[ml,mcp] @ file:///path/to/science-agent"`);
- missing Kaggle credentials: `~/.kaggle/kaggle.json` with mode 0600;
- sandbox unavailable: portable mode is weaker; strict claims are blocked; say so in every report;
- low disk: free space or `sagent gc`;
- ledger mismatch: stop and inspect; do not run experiments;
- workspace missing or objective not locked: follow the matching skill's **Intake**
  (`science-research` for a question, `science-agent-kaggle` for a competition, `science-agent` otherwise).
