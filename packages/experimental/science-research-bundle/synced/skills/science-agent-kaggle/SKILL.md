---
name: science-agent-kaggle
description: >
  Auditable Kaggle competition modeling with science-agent rounds. Use this skill when the user
  names a Kaggle competition or works in a Kaggle competition workspace: intake and download,
  profiling its data, a baseline, improving the CV or leaderboard score, verifying model results, a
  traceable report, public notebooks, or preparing and uploading a submission. Triggers include
  "Kaggle", "competition", "leaderboard", "LB", "submission", "public notebooks", "竞赛", "提分",
  "提交", "排行榜". For experiments outside a Kaggle competition use science-agent; for an open
  research question use science-research.
version: 0.11.0
---

# Science-Agent Kaggle Orchestrator

This skill drives **auditable rounds** on a Kaggle workspace. A round is not a chat: its state
lives in `.sa/`, and its truth comes from package-owned verifiers, not from the agent that wrote the
code. Load a file from `references/` only when you need it (list at the end).

## DeepSeek Harness runtime

You are running inside the DeepSeek Harness (dsh), not Claude Code. The runtime mapping:

- File and shell tools are `read`, `write`, `edit`, `glob`, `grep`, `bash`.
- Subagents are the preset's per-role tools: `sa_scout`, `sa_hypothesis`, `sa_engineer`,
  `sa_verifier`, `sa_statistician`, `sa_reporter`. Each gets its own persona and inherits this
  preset's tools, skills, MCP servers, and hooks. The generic `subagent` and `subagent_fork` tools
  also exist for tasks outside the science-agent roles.
- The MCP server registers `mcp__science-agent__sa_*` tools. They mirror the `sagent` CLI; pass the
  `workspace` argument explicitly when the session workspace is not the launch directory.
- The dsh `workflow` tool runs JavaScript orchestration. `agent(prompt, options)` supports `label`,
  `phase`, `schema`, `provider`, and `model`; it does not support `agentType`, `effort`, or nested
  `workflow()` calls. The bundle's saved `science-campaign` (round inlined) and `science-round`
  workflows embed each role persona in their prompts and use only the supported options.
- **Mapping rule.** Wherever a skill says `Workflow({name: "science-agent:<X>", args})`, call
  `workflow({name: "<X>", args})` with the same args minus `agentPrefix`, `useAgentTypes`,
  `roundWorkflow`, and `roundScriptPath`. The profile saves the bundle's workflows by name, so the
  script itself never enters your context.

Not this skill: a one-line code edit with no experiment (normal coding flow); a question about
Kaggle rules or a paper (answer directly, no workspace). If the user wants a quick script without
verification, say what is lost (no independent metric recomputation, no provenance, no submission
gate) before doing it.

## Non-negotiables

1. Every metric comes from `sagent` state, never from an experiment's self-report.
2. The worker never marks its own work verified. Only `sagent verify` writes verdicts.
3. Never read the hidden holdout, `.sa/private`, or `.sa/ledger` directly; use `sagent` commands.
4. Never edit `.sa/ledger`, `.sa/objects`, `.sa/manifests`, or the installed verifier package.
5. Never use public LB feedback to select a model or feature.
6. Never substitute synthetic data for missing input data.
7. Never submit without a human approval token created by `sagent approve` in a terminal.
8. Keep failed runs and negative results. Do not delete them to make a report look better.
9. Report numbers must resolve from verified state. If a number has no source, do not write it.
10. If a precondition fails, stop and report the exact missing step; do not improvise around it.

## Preflight

```bash
sagent doctor --json
sagent status --json
sagent ledger verify --json
```

If the workspace is missing, go to **Intake**, even when the folder already holds hand-run kernels
or notes: do not continue them as untracked shell commands. If the ledger fails, stop: do not run
experiments on a tampered state. If `sagent domain show --json` reports `control: prompt`, this is a
research workspace: follow the `science-research` skill instead.

## Intake (no workspace / no objective / no frozen data)

For a Kaggle competition with labelled CSV data, intake is two commands with one human confirmation
between them:

```bash
sagent -w <dir> kaggle intake <slug> --json          # downloads, drafts objective.draft.yaml with evidence per field
sagent -w <dir> kaggle intake <slug> --lock --json   # after the user confirms: lock, freeze, profile, holdout, folds
sagent -w <dir> env init --profile cpu-standard --json
```

Show the user the draft, each field's evidence, and every field listed in `needs_confirmation` (the
external-data rule always is; a metric without its cutoff or with no Kaggle metadata is too). Edit
`objective.draft.yaml` with their answers before `--lock`. Never lock a guessed metric.

Other tasks (code competitions, data outside Kaggle) are built by hand:

```bash
sagent init --workspace <dir> --competition <slug> --type <tabular|timeseries|cv|nlp|llm|packing> --json
sagent objective create --file objective.yaml --json      # template: examples/objective.playground.yaml
sagent objective lock --json
sagent kaggle download --competition <slug> --files train.csv,test.csv,sample_submission.csv --json
sagent data freeze --json
sagent data profile --adversarial --json
sagent holdout create --strategy auto --frac 0.2 --seed 42 --json
sagent env init --profile cpu-standard --json
```

The objective states the slug, metric and direction, target column, submission constraints,
budget, and stop rules. A packing task skips download, freeze, and holdout and uses
`--profile packing` (`references/kaggle-playbook.md` §12). If the CLI reports 403 or rules, ask the
user to accept the rules on kaggle.com and retry. If disk is low, report the number and stop; do not
download a large competition silently.

## Public notebooks

When the objective allows them (`constraints.no_public_notebooks: false`, the intake default), the
scout lists the competition's most-voted notebooks with `sagent kaggle sources --top 5 --json` as
prior-art leads, and an explore round reads them for idea families not tried yet. Snapshot one with
`--pull` before citing it; never copy its code. Public leaderboard scores are never evidence for a
decision.

## What to run

| Situation | What to run |
|---|---|
| No workspace/objective/frozen data | **Intake** in the main session; no fan-out |
| "run experiments", "improve", "continue", "overnight", "until target", "run N rounds" | **Campaign**: it chooses each round's mode itself |
| The user asks for exactly one round, or `/sa-round` | **Single round** |
| The workflow tool is unavailable | one quick round by hand, and say so; never fake fan-out |
| The objective changed mid-campaign | blocked: new objective version + human approval |

How `campaign check` picks quick, debug, or full mode: `references/workflow.md` §1.

## Campaign

**An experiment request is a campaign, not a plan.** When the user says "继续实验", "跑一轮",
"continue", or "继续", start the campaign in this turn: no progress summary, plan, or manual
`sagent run execute` commands first. A short status line before the call is fine.

1. Read the budget (`sagent objective show --json`) and the templates path
   (`sagent templates-path --json`).
2. **Launch the campaign**. The adapted dsh workflow is saved in the bundle and launched by name:

```text
workflow({
  name: "science-campaign",
  args: {
    workspace: "<absolute workspace>",
    saBin: "sagent",
    controller: "tree",
    roundArgs: {
      maxHypotheses: 3,
      maxRuns: <objective.budget.max_runs_per_round>,
      runTimeoutSec: 1800,
      templatesDir: "<absolute path from `sagent templates-path --json`>"
    }
  }
})
```

   The script carries the round body inline and does not accept `agentType`, `agentPrefix`,
   `useAgentTypes`, `roundScriptPath`, or `effort`; each role persona is embedded in the prompt. If
   `sagent` is not on PATH, resolve it with `command -v sagent` or `~/.local/bin/sagent` and pass the
   absolute executable path in `saBin`. If the `workflow` tool is unavailable, run one quick round by
   hand and close it with `sagent round close`; do not hand-roll a fake multi-agent sequence.

3. **After it returns**, confirm from state rather than from the summary:

```bash
sagent campaign list --json
sagent campaign check --campaign <campaign_id> --json
sagent state briefing --json
```

Each round was already closed by `sagent round close` (decide → claim sync → report → strict check
→ verify design → stage marks → outcome). Do not accept a workflow summary as the decision, and do
not re-run those steps by hand.

4. **If no round produced a verified candidate**, do not fabricate one. Report the blocking checks;
   the next campaign starts in `debug` mode.

## Single round

```bash
sagent round begin --mode <quick|full|debug> --controller tree --json
```

Then `Workflow({name: "science-agent:science-round", args: {workspace, roundId, mode, saBin, templatesDir, maxHypotheses, maxRuns, runTimeoutSec}})`
(`science-agent:kaggle-round` is an alias), and afterwards exactly one close:

```bash
sagent round close <round_id> --json
```

## Reading results

- `sagent status --json`: workspace, objective, latest round, counts.
- `sagent state briefing --json`: best verified run, budget, failures, negative results, LB probes,
  recommended next actions. This is the primary input to the next round.
- `sagent search next --policy tree --json`: UCB-ranked expansion candidates.
- `sagent search curve --json`: best-so-far with cost.
- `sagent verify design --round <id> --json`: seed variance, multiple comparisons, budget fairness.
- `sagent claim audit --json`: claims without evidence or verdicts.

Every number you quote must come from one of these outputs or from the report. For "how good is
it", give the verified value with seeds and trust level, and note that CV is not the leaderboard.

## Submission gate

```bash
sagent submit validate <workspace>/runs/<run_id>/output/submission.csv --json
sagent decide --round <round_id> --json
sagent submit prepare --run <run_id> --decision <decision_id> --json
sagent approve --action submit --ttl 10 --json        # the user runs this, in a terminal
sagent submit upload --submission <submission_id> --approval-token <token> --message "..." --json
```

Never run the upload without an explicit human instruction and a fresh token. The token is bound to
the submission hash and expires. Public LB scores are external, unverified evidence; they never
support a generalization claim and never drive model selection.

## When something fails

Never "fix" leakage by changing the CV after seeing the score; never let an experiment generate
synthetic data; never claim a GPU result that was never run; never disable strict mode in a final
report (remove the unsourced number instead). Fix only what is fixable in code or outputs, as a
child run, keeping the old one. Exact recovery steps per failure: `references/troubleshooting.md`.

The campaign stops when a stop rule fires (`references/workflow.md` §1 lists them). Report which
rule fired; do not silently continue.

## Reporting to the user

1. What ran: mode, round id, number of hypotheses/runs, wall time.
2. Best verified result: metric, seeds, trust, verdict status; compare to baseline with delta.
3. What failed and why: blocking checks, negative results, eliminated candidates.
4. What is uncertain: warnings, single-seed runs, disputed claims, holdout not yet revealed.
5. Cost: wall/CPU and any recorded agent cost; say "not recorded" if missing.
6. Next action: the `sagent search next` recommendation, or the stop rule that fired.
7. Link the report path.

Do not present a failed run's metric as a result. Do not merge public LB with CV.

## References

- `references/architecture.md` — ledger, artifacts, provenance, state model.
- `references/verifier-ladder.md` — L0–L5 checks and what each blocks.
- `references/kaggle-playbook.md` — CV and leakage checklists per task type; packing (§12).
- `references/workflow.md` — campaign and round graphs, modes, stop rules, resume, agent roles.
- `references/reporting.md` — claim types, slots, strict report audit.
- `references/desktop-mcp.md` — Claude Desktop round state machine and tool set.
- `references/troubleshooting.md` — common failures and exact recovery commands.
- `references/cli-reference.md` — full CLI surface.
- `references/benchmark.md` — sealed benchmark tasks: prepare, run, grade, compare agent versions.
