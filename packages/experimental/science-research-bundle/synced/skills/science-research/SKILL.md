---
name: science-research
description: >
  General-purpose research loop with science-agent: investigate an open question in any field (LLMs
  and machine learning, data science, physics, chemistry, biology) through rounds of retrieval,
  planning, sandboxed experiments, independent validation, and a next-step plan that the following
  round starts from. Every step is an agent following its own prompt. Use this skill when the user
  asks to research, investigate, or study a question, to find out whether or why something happens,
  to discover or test a new method, to combine a literature review with experiments, to continue a
  research workspace, or to say what the research has found so far. Triggers include "research",
  "investigate", "study", "find out why", "test the hypothesis", "new method", "literature and
  experiments", "研究", "调研并做实验", "探索", "验证假设", "继续研究". For a Kaggle competition use
  science-agent-kaggle; for a fixed scorer (packing, optimization) or equation discovery use science-agent.
version: 0.11.0
---

# Science-Agent Research Loop

A research workspace answers a question. The `research-loop` workflow runs rounds until the
next-step node decides to stop or a hard limit is reached, then writes a report:

```text
round:  retrieve-search → [retrieve-read ×N → retrieve-refine]*        what to read, read it, enough?
        plan                                                           experiments + analysis, recorded first
        experiment-build ×N  → [plan, once, if a build is blocked]     revised before anything runs
        per experiment:  [experiment-run → experiment-debug]*
                         validate-check → [validate-challenge → validate-recheck]*
        next-step                                                       state, next plan, continue or stop
end:    write-up
```

Each node is an agent whose instructions are `plugin/agents/research-<node>.md`. **The prompts make
every judgment**: what to read, what to test and how to analyze it, whether a result holds, what to
do next, when to stop. The workflow script only sequences nodes and enforces loop caps. Code only
runs experiments in the sandbox, records what each node wrote, snapshots sources, and enforces hard
limits (rounds, deadline, spend).

## DeepSeek Harness runtime

You are running inside the DeepSeek Harness (dsh), not Claude Code. The runtime mapping:

- File and shell tools are `read`, `write`, `edit`, `glob`, `grep`, `bash`.
- The MCP server registers `mcp__science-agent__sa_*` tools, including `sa_research`. They mirror the
  `sagent` CLI; pass the `workspace` argument explicitly when the session workspace is not the launch
  directory.
- The dsh `workflow` tool runs JavaScript orchestration. The profile saves the bundle's `research-loop`
  workflow by name; every node prompt is embedded in the script, so the script never enters your
  context and no node depends on registered agent types.
- **Mapping rule.** Wherever this skill says `Workflow({name: "science-agent:research-loop", args})`, call
  `workflow({name: "research-loop", args})` with the same args minus `agentPrefix` and `useAgentTypes`.
  If the `workflow` tool refuses, report its error verbatim. If it is absent, say so and run one round
  by hand as described below.
- The example objective is at `synced/examples/objective.research.yaml` under the bundle root named in
  your instructions.

## Non-negotiables

1. A round's plan, including how each result will be analyzed, is recorded
   (`sagent research record`) before its first experiment runs, and the analysis is not changed
   afterwards. The ledger shows the order.
2. Experiments run only through `sagent run execute`. Never run `main.py` directly.
3. Every number in a state file or report names its run; every literature fact names a citation
   whose quote is in a stored source snapshot (`sagent evidence cite` refuses others).
4. A result is judged by a validator that did not build it and challenged by a skeptic before it
   enters `research/state.md`.
5. Network access and API keys reach experiments only through the locked objective
   (`research.resources`). Never pass `--allow-network`; never put a key in code.
6. Never edit `.sa/`, `runs/`, or the installed package. Keep failed runs and negative results.

## Intake

The question is the user's. Take it from their words; do not sharpen it into a different question.

1. `sagent init --workspace <dir> --type research --json`
2. Write `objective.yaml` from the example objective (`synced/examples/objective.research.yaml` under the bundle root): `research.question` (required);
   `questions` only when the user gave sub-questions; `field`; `scope`; `success` (what would count
   as an answer); `standards` (the evidence the user will accept, in their words);
   `resources.compute`; `budget.max_rounds`, `max_wall_clock_min_per_run`, `max_usd`.
   Leave `resources.network: false` and `resources.env: []` unless the user asked for experiments
   that call a hosted model or download data. Granting network or a key is the user's decision: ask.
3. `sagent -w <dir> objective create --file objective.yaml --json && sagent -w <dir> objective lock --json`
4. `sagent -w <dir> env init --profile research --json`. When the question runs existing code (a
   harness, a repository, a package), read its requirements (`requirements.txt`, `pyproject.toml`,
   imports), compare them with `sagent -w <dir> env show --json`, and show the user the
   `sagent -w <dir> env add <pkg>==<version> ...` line for what is missing before the loop starts.
   Adding packages is the user's decision; a loop started without them stops at the first build.
5. Data, when the question is about data: put files in `data/raw/`; experiments declare them under
   `inputs` in `run.yaml`. Simulations need no data.
6. Optional: `research/guidance.md`, the user's standing instructions to every node (preferred
   methods, sources to trust or avoid, a stricter evidence bar). Editing it needs no reinstall.
7. `sagent -w <dir> doctor --json`. Stop at the first failing step and name the missing command.

If `sagent domain show --json` reports a metric pack (a Kaggle competition, a scored or equation
task), this is not a research workspace: follow `science-agent-kaggle` or `science-agent` and run
the `science-campaign` workflow instead (see the `science-agent` skill's **Which loop** table).

## Run the loop (default for "research this" and "continue")

```text
Workflow({
  name: "science-agent:research-loop",
  args: {
    workspace: "<absolute workspace>",
    saBin: "sagent",
    maxRounds: 3,              // rounds in this invocation; the objective's max_rounds is the hard cap
    maxFocuses: 3,             // readers per retrieval pass
    maxRetrievalPasses: 2,
    maxExperiments: 3,         // per round; the plan lists them in priority order
    maxPlanRevisions: 1,       // re-plans after blocked builds, before any run; 0 turns it off
    maxDebugAttempts: 2,
    maxChallengePasses: 2,
    runTimeoutSec: <60 * objective.budget.max_wall_clock_min_per_run>
  }
})
```

The script is saved in the profile and embeds every node prompt, so it needs no agent types or script path. A run that was interrupted resumes: the still-open round is reused.

Models per node come from the workspace's `.sa/config.toml`, which `research open-round` reports, so
the launch needs no `models` argument (one passed in args wins). Keys are node names plus `clerk`:

```toml
[agents.models]
clerk = "<a small, fast model>"            # copies commands; no judgment
experiment-run = "<a small, fast model>"   # runs and classifies; no judgment
validate-challenge = "<a different model from the builder's>"
```

A role left out runs on the session model.

**Save the report when the workflow returns.** Workflow subagents may not write report files, so the
write-up node returns the report as text. If `result.report.markdown` is set, write it verbatim to
`<workspace>/research/report.md` yourself, then run
`sagent -w <dir> research record --round <result.report.round_id> --node write-up --file research/report.md --json`.
Do not edit its content.

Without the `workflow` tool, say so and run one round by hand: `sagent research open-round --json`,
then for each node in the order above run `sagent research prompt <node>`, do what it says, and
record its files. After the plan node, register the plan before anything runs (runs are refused
until then): write `{"entries": [{"label": "r<N>-plan", "node": "plan", "result": <the plan node's
return>}]}` to a JSON file and run `sagent research results --round <id> --plan-file <round plan.md>
--file <that json> --json`. Save the other nodes' returns the same way, without `--plan-file`. Finish
with `sagent research close-round <id> --decision <continue|stop>`.

## Reading results

```bash
sagent -w <ws> research status --json    # rounds, decisions, recorded node outputs, runs, literature
```

- `research/state.md`: the state of knowledge; `research/plan.md`: the next-step plan;
  `research/report.md`: the final report.
- `research/rounds/NN/`: `retrieval/`, `plan.md`, `experiments/<id>/`, `validation/`. The round log
  (one entry per round) is the last section of `research/state.md`.
- `runs/<run_id>/`: code snapshot, outputs, logs of every run.

## Reporting to the user

1. The answer(s) and their confidence, from `research/report.md` or `state.md`.
2. Findings with their numbers, uncertainty, run ids, and how they were validated.
3. Refuted hypotheses, null results, failed experiments.
4. What is not established, and open objections.
5. The next-step plan and why the loop stopped (the next-step decision or the hard limit). When it
   stopped for a person (`needs_human` in the last round), say exactly what is needed and give the
   command. When it stopped with `registration-failed`, no round was spent: the round is still open,
   and running the loop again resumes it.

Say plainly what is guaranteed: code records what ran and when each node's output was written, and
checks that cited quotes exist in their sources. Whether an analysis is right and whether a result
holds are model judgments, made against a plan written before the data and challenged by a skeptic.
