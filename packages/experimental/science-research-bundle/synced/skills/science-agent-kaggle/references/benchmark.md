# Benchmark

`sagent bench` measures the agent on sealed Kaggle tasks so that two agent versions or configurations can be compared on
the same splits. Load this reference when the user asks to benchmark, evaluate, or compare the agent, not during an
ordinary competition.

## Steps

1. `sagent bench list --json` lists the packs: `starter` (eight CPU-feasible competitions) and `ci` (two synthetic tasks
   that need no download).
2. `sagent bench prepare <task> --out <dir> [--pack starter] [--rep N] [--arm LABEL] --json` downloads the competition
   once into the bench cache, carves a hidden split from its train file, seals the hidden labels outside the workspace,
   and builds `<dir>/<task>-r<N>` as a locked workspace with frozen data, a holdout, and frozen folds. Kaggle tasks need
   the competition rules accepted on kaggle.com.
3. `sagent bench run <workspace> --launcher '<command with {workspace} and {prompt}>' --json` starts the agent with the
   sealed-benchmark prompt and stops it at the task's wall-clock limit, then reaps orphaned work. Without a launcher
   (or `SA_BENCH_LAUNCHER`) it returns the prompt for a human to run.
4. `sagent bench grade <workspace> [--arm LABEL] --json` scores the run the agent's own code chose (the final pair's
   primary pick, else the latest decision) on the sealed labels. It records the score, the medal and median thresholds
   from the competition's leaderboard under Kaggle's progression rules, the leaderboard percentile, the gap between the
   verified CV score and the hidden score, and the effort spent (runs, rounds, rounds improved, orphans).
5. `sagent bench report [--arm A --arm B] --json` summarizes each arm (valid rate, medal rate, above-median rate, mean
   percentile) and, for two arms, the paired percentile gain over matching (task, rep) trials with a bootstrap 95%
   interval.

## Rules

- A benchmark run is sealed: no web search, no public notebooks, no data outside the workspace, no Kaggle submission.
  The answers live under the bench home (`SA_BENCH_HOME`, default the user data directory); never read them.
- Compare arms on the same tasks and reps with the same wall-clock budget and model map. Use at least three reps per
  task: one run per task is too noisy to separate two arms.
- Report the paired percentile gain and its interval as the headline. Medal rate over a few dozen trials is coarse.
- The hidden split comes from the competition's train file, not Kaggle's private test set, so a leaderboard
  percentile is an approximation.
