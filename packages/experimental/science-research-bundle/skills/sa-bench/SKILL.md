---
name: sa-bench
description: "Benchmark the research agent on sealed Kaggle tasks: prepare, run, grade, and compare agent versions."
user-invocable: true
disable-model-invocation: true
---

# /sa-bench

The user invoked `/sa-bench`. Read the optional subcommand and arguments from the message text after the command token: `[list | prepare <task> <dir> [rep] | grade <workspace> | report [arm] [arm]]`; default: `list`.

Follow `references/benchmark.md` of the `science-agent-kaggle` skill.

- `list`: run `sagent bench list --json` and show each pack's tasks.
- `prepare`: run `sagent bench prepare <task> --out <dir> --rep <rep> --json` and show the workspace path. If the download fails with a rules error, ask the user to accept the competition rules on kaggle.com.
- `grade`: run `sagent bench grade <workspace> --json` and show the score, medal, percentile, and CV gap.
- `report`: run `sagent bench report [--arm A --arm B] --json` and show each arm's rates and the paired gain with its interval.

Do not run a benchmark task inside this session: a bench run is sealed and starts in its own headless session through `sagent bench run`. Never read the sealed answers.
