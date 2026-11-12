---
name: sa-doctor
description: "Check the science-agent environment, sandbox, disk, Kaggle credentials, ledger, and plugin."
user-invocable: true
disable-model-invocation: true
---

# /sa-doctor

Run:

```bash
sagent doctor --json
sagent ledger verify --json
sagent plugin status --json
sagent sandbox selftest --json
```

Report each check as pass/warn/fail. Explain the fix for failures:
- missing `sagent`: install the toolkit (`scripts/install.sh` or `uv tool install "science-agent-toolkit[ml,mcp]"`);
- missing Kaggle credentials: `~/.kaggle/kaggle.json` with mode 0600;
- sandbox unavailable: portable mode is weaker; strict claims are blocked;
- low disk: free space or `sagent gc`;
- ledger mismatch: stop and inspect; do not run experiments;
- workspace missing: `sagent init`.

If the sandbox selftest fails, do not claim strong isolation in any report.
