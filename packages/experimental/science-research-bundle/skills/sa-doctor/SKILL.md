---
name: sa-doctor
description: "Check the science-agent toolkit, sandbox, disk, ledger, and research workspace."
user-invocable: true
disable-model-invocation: true
---

# /sa-doctor

Run:

```bash
sagent doctor --json
sagent ledger verify --json
sagent sandbox selftest --json
sagent research status --json
```

Report each check as pass/warn/fail. Explain the fix for failures:
- missing `sagent`, or no `research` command: install the toolkit 0.3.0 or later
  (`uv tool install --force "science-agent-toolkit[ml,mcp] @ file:///path/to/science-agent"`);
- sandbox unavailable: portable mode is weaker; say so in every report;
- low disk: free space or `sagent gc`;
- ledger mismatch: stop and inspect; do not run experiments;
- workspace missing: `sagent init --workspace <dir> --type research`;
- objective not locked: follow the `science-research` skill's **Intake**.
