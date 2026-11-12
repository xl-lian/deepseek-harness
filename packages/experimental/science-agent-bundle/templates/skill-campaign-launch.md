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
