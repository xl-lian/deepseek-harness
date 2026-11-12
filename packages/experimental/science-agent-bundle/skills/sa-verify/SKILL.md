---
name: sa-verify
description: "Verify a science-agent run or round with the L0-L4 ladder."
user-invocable: true
disable-model-invocation: true
---

# /sa-verify

The user invoked `/sa-verify`. Read the argument from the message text after the command token:
`<run-id>` or `round <round-id>`.

If the argument starts with `round`, run:

```bash
sagent verify design --round <round-id> --json
```

Otherwise, for the run id:

```bash
sagent verify run <run-id> --levels L0,L1,L2,L3,L4 --json
sagent run show <run-id> --json
```

Read `.sa/runs/<run-id>/verdict.json` for check details. Report:
- aggregate verdict and trust;
- every blocking failure with check id and evidence;
- warnings (single seed, weak isolation, LB probes);
- the L2 recomputed value vs the reported value;
- whether the failure is repairable (only L0/L1 code/output errors).

Do not edit the run or "fix" the score. If verification fails because of leakage or metric
mismatch, the correct next action is a new hypothesis/run, not a changed CV.
