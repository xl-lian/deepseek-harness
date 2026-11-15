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
