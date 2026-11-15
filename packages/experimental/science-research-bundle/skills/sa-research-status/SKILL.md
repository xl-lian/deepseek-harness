---
name: sa-research-status
description: "Show what a science-agent research workspace has established: rounds, verdicts, evidence class, open objections, literature, and the next-step plan."
user-invocable: true
disable-model-invocation: true
---

# /sa-research-status

Run:

```bash
sagent research status --json
sagent ledger verify --json
```

Then read `research/state.md` and `research/plan.md` when they exist.

Present:
- the question and the objective status;
- per round: the decision and its reason, whether the plan was registered before any run, and each
  experiment's verdict, confidence, evidence class (confirmatory or exploratory, with the `demoted_by`
  reasons), and open objections;
- sources and quote-checked citations;
- the next-step plan and any hard limit that would fire if a round opened now.

Call a result established only when its evidence class is confirmatory. If the ledger fails
verification, say so first.
