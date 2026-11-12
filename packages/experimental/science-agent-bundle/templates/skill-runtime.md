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
