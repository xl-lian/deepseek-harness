---
name: science-agent-kaggle
description: >
  Auditable Kaggle competition modeling with science-agent rounds. Use this skill when the user
  asks to profile a Kaggle dataset, establish a baseline, run experiments, improve CV/LB, verify
  model results, produce a traceable report, prepare a submission, or run a "science-agent round".
  Triggers include "Kaggle", "competition", "leaderboard", "LB", "submission", "CV", "modeling",
  "run an experiment", "continue experiments", "improve the score", "science agent", "跑实验",
  "继续实验", "继续跑实验", "接着跑", "建模", "竞赛", "提分", "提交", "验证".
version: 0.2.0
---

# Science-Agent Kaggle Orchestrator

This skill drives one or more **auditable rounds** on a Kaggle workspace. A round is not a chat;
it is a research loop whose state lives in `.sa/` and whose truth is produced by package-owned
verifiers, not by the agent that wrote the code.

The full architecture and rationale live in `references/`. Load only the reference you need.

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

## When to use

- The user names a Kaggle competition or a local tabular/time-series/CV/NLP/LLM modeling task.
- The user asks to run, compare, verify, or report experiments.
- The user asks to prepare or submit a Kaggle submission.
- The user asks "what did we learn / what is the best verified result / why did this fail".

## When not to use

- A one-line code edit with no experiment, metric, or data involved: use a normal coding flow.
- A question about Kaggle rules or a paper: answer directly; do not initialize a workspace.
- The user explicitly asks for a quick single script without verification: say what will be lost
  (no independent metric recomputation, no provenance, no submission gate) and use Quick mode only
  if they still want it.

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

Run these before deciding a mode:

```bash
sagent doctor --json
sagent status --json
sagent ledger verify --json
```

If the workspace is missing, go to **Intake** below, even when the folder already holds hand-run
kernels or notes: do not continue them as untracked shell commands. If the ledger fails, stop: do
not run experiments on a tampered state. If `sagent domain show --json` reports `control: prompt`,
this is a research workspace: follow the `science-research` skill instead (see the `science-agent`
skill's **Which loop** table).

## Intake (no workspace / no objective / no frozen data)

For a Kaggle competition with labelled CSV data, intake is two commands with one human confirmation between them:

```bash
sagent -w <dir> kaggle intake <slug> --json          # downloads, drafts objective.draft.yaml with evidence per field
sagent -w <dir> kaggle intake <slug> --lock --json   # after the user confirms: lock, freeze, profile, holdout, folds
sagent -w <dir> env init --profile cpu-standard --json
```

Show the user the draft, each field's evidence, and every field listed in `needs_confirmation` (the external-data
rule always is; a metric without its cutoff or with no Kaggle metadata is too). Edit `objective.draft.yaml` with
their answers before `--lock`. Never lock a guessed metric.

For other tasks (packing, code competitions, data outside Kaggle), build the workspace by hand:

1. Initialize, or ask the user for the competition slug and local path:

```bash
sagent init --workspace <dir> --competition <slug> --type <tabular|timeseries|cv|nlp|llm|packing> --json
```

2. Create an objective from a YAML/JSON file. The objective must state the competition slug,
   metric and direction, target column, submission constraints, budget, and stop rules.
   `examples/objective.playground.yaml` is the template; `examples/objective.packing.yaml` shows a
   packing objective with a pinned scorer.

```bash
sagent objective create --file objective.yaml --json
sagent objective lock --json
```

3. Acquire and freeze data (tabular tasks):

```bash
sagent kaggle download --competition <slug> --files train.csv,test.csv,sample_submission.csv --json
sagent data freeze --json
sagent data profile --adversarial --json
sagent holdout create --strategy auto --frac 0.2 --seed 42 --json
sagent env init --profile cpu-standard --json
```

Packing tasks do not have a labelled train table: skip the download/freeze/holdout steps and run
`sagent env init --profile packing --json`. If the rules require accepting on kaggle.com, do that in
a browser first.

Rules acceptance happens on kaggle.com in a browser; if the CLI reports 403/rules, ask the user
to accept the rules and retry. Do not proceed with missing data. If disk is low, report the number
and stop; do not download a large competition silently.

## Public notebooks

When the objective allows them (`constraints.no_public_notebooks: false`, the intake default), the scout lists the
competition's most-voted notebooks with `sagent kaggle sources --top 5 --json` as prior-art leads, and an explore round
reads them for idea families not tried yet. Snapshot one with `--pull` before citing it; never copy its code. Public
leaderboard scores are never evidence for a decision.

## Mode decision

| Situation | What to run |
|---|---|
| No workspace/objective/frozen data | **Intake** in the main session; no fan-out |
| "run experiments", "improve", "continue", "overnight", "until target", "run N rounds" | **Campaign** (below) — it chooses each round's mode itself |
| The user asks for exactly one round, or `/sa-round` | **Single round** (below) |
| The workflow tool is unavailable | one quick round by hand + explicit limitation; never fake fan-out |
| The objective changed mid-campaign | blocked: new objective version + human approval |

`sagent campaign check` picks each round's mode deterministically: `quick` (one baseline candidate)
when no baseline exists, `debug` (one fix for the dominant failure) when the controller says debug or
>70% of recent runs failed execution/verification, otherwise `full` (three lenses, a selector, and as
many candidates as `maxRuns / seeds` allows). The default for a brand-new workspace is **intake**,
then a campaign.

For `problem.task_type: packing` (domain pack `scored`), "baseline first" means verifying the current
incumbent bank unchanged, so later rounds have a certified reference score.

## Campaign

**An experiment request is a campaign, not a plan.** When the user says "继续实验", "跑一轮",
"continue", or "继续", start the campaign in this turn. Do not answer with a progress summary, a
plan, or manual `sagent run execute` commands first; the workflows own scout/hypotheses/engineer/
verify, and `sagent` owns every decision. A short status line before the call is fine.

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

3. **After the campaign returns**, confirm from state rather than from the summary:

```bash
sagent campaign list --json
sagent campaign check --campaign <campaign_id> --json
sagent state briefing --json
```

Each round was already closed by `sagent round close` (decide → claim sync → report build → strict
check → verify design → stage marks → outcome → round end). Do not accept a workflow summary as the
decision, and do not re-run those steps by hand.

4. **If no round produced a verified candidate**, do not fabricate one. Report the blocking checks;
   the next campaign will start in `debug` mode.

## Single round

```bash
sagent round begin --mode <quick|full|debug> --controller tree --json
```

Then `Workflow({name: "science-agent:science-round", args: {workspace, roundId, mode, saBin, templatesDir, maxHypotheses, maxRuns, runTimeoutSec}})`
(`science-agent:kaggle-round` is a compatible alias), and afterwards exactly one close:

```bash
sagent round close <round_id> --json
```

## Packing and code competitions

A packing task (`problem.task_type: packing`) has no labelled train/test split: validity is decided
by the competition's own metric. The round contract differs in four places:

1. The objective's `competition.metric.recompute` names a workspace-relative Python file defining
   `recompute(context)`, and `recompute_sha256` pins its bytes. The verifier refuses a changed
   scorer; updating it is a human `sagent objective update`, never an agent edit.
2. Runs produce `metrics.json` + `submission.csv` (+ optional `details.json`) instead of
   OOF/folds/CV files. The engineer starts from the `packing_bank.py` and `packing_run.yaml`
   templates and declares the base bank under the run's `inputs`.
3. L2 recomputes the score from the submission and fails `submission.feasible` for any rejected
   item; L3 skips CV/leakage and compares the certified total to the baseline. L5 does not apply.
4. Seed runs default to one: a certified packing is deterministic given its parameters, so
   run-to-run variance is optimizer variance, not label noise.

The objective resolves to the `scored` domain pack (`sagent domain show --json`); the round workflow
reads its scout commands, lenses, templates, run contract, and verify/L3 notes from the pack.
Round close, decide, report, and submission steps are unchanged. A first round
verifies the incumbent bank unchanged as the baseline; later rounds compare against it.

## Reading results


- `sagent status --json`: workspace, objective, latest round, counts.
- `sagent state briefing --json`: best verified run, budget, failures, negative results, LB probes,
  recommended next actions. This is the primary input to the next round.
- `sagent search next --policy tree --json`: UCB-ranked expansion candidates.
- `sagent search curve --json`: best-so-far with cost.
- `sagent verify design --round <id> --json`: seed variance, multiple comparisons, budget fairness.
- `sagent claim audit --json`: claims without evidence or verdicts.
- `sagent ledger verify --json`: tamper check.

Every number you quote to the user must come from one of these outputs or from the report. If the
user asks "how good is it", say the verified value plus seeds and trust level, and note that CV is
not the leaderboard.

## Submission gate

1. Validate the chosen run's submission:

```bash
sagent submit validate <workspace>/runs/<run_id>/output/submission.csv --json
sagent decide --round <round_id> --json
sagent submit prepare --run <run_id> --decision <decision_id> --json
```

2. The user must approve in a terminal:

```bash
sagent approve --action submit --ttl 10 --json
```

3. Only then upload:

```bash
sagent submit upload --submission <submission_id> --approval-token <token> --message "..." --json
```

Never run the upload yourself without an explicit human instruction and a fresh token. The token is
bound to the submission hash and expires. Public LB scores are external, unverified evidence; they
never support a generalization claim and never drive model selection.

## Failure handling

- **Data missing / not frozen**: run the Intake steps; do not let an experiment generate synthetic
  data. L0 blocks synthetic fallback.
- **Rules not accepted**: ask the user to accept on kaggle.com; retry the download.
- **Disk low**: report free GB and stop; use `sagent gc` after the user confirms.
- **No GPU / large CV/NLP model**: use the CPU scaffold for a small smoke run or keep the experiment
  as a remote-backend TODO. Do not claim a GPU result that was never run.
- **Verifier fails**: read the checks; fix only what is fixable (code/output). Never "fix" leakage
  by changing the CV after seeing the score. Create a child run, keep the old one.
- **Report strict check fails**: remove the unsourced number or add a slot that resolves from state;
  do not disable strict mode in a final report.
- **Objective changed**: create a new objective version; old claims stay bound to the old version.

## Stop rules

`sagent campaign check` evaluates them in code after every round close; the campaign stops when any
fires:

- `target_metric`: the verified best reaches `objective.stop.target_metric`;
- `no_improvement_rounds`: that many consecutive closed rounds had outcome other than `improved`;
- `max_rounds`: the campaign (or `objective.budget.max_rounds`) round count is reached;
- `deadline`: `objective.budget.deadline` has passed;
- `max_usd`: recorded agent + run spend reaches `objective.budget.max_usd`;
- `consecutive_failed_rounds`: two closed rounds in a row produced no verified candidate;
- `consecutive_blocked_rounds`: two closed rounds in a row produced no runs at all;
- blocking: `ledger_tampered`, `objective_not_locked`.

Report which rule fired. Do not silently continue.

## Reporting to the user

Use this shape:

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
- `references/kaggle-playbook.md` — tabular/time-series/CV/NLP/LLM CV and leakage checklists.
- `references/workflow.md` — round graph, barriers, resume, agent roles.
- `references/reporting.md` — claim types, slots, strict report audit.
- `references/desktop-mcp.md` — Claude Desktop round state machine and tool set.
- `references/troubleshooting.md` — common failures and exact recovery commands.
- `references/cli-reference.md` — full CLI surface.
- `references/benchmark.md` — sealed benchmark tasks: prepare, run, grade, compare agent versions.
