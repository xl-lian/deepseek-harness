---
name: sa-status
description: "Show science-agent workspace, round, best verified result, failures, claims, and budget."
user-invocable: true
disable-model-invocation: true
---

# /sa-status

The user invoked `/sa-status`. Read the optional round id from the message text after the command token.

Run:

```bash
sagent status --json
sagent state briefing --json
sagent ledger verify --json
```

If a round id is present, also run `sagent round status --round <id> --json`.

Present:
- objective and metric/direction;
- latest round and stage status;
- best verified run with metric, seeds, trust, and verdict;
- recent failures and negative results;
- claims: supported / disputed / unverified counts;
- public LB probes vs the allowed maximum;
- the `sagent search next` recommendation.

Do not quote unverified metrics. If the ledger fails verification, say so first.
