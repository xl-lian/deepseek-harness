## DeepSeek Harness runtime

You are running inside the DeepSeek Harness (dsh), not Claude Code. The runtime mapping:

- File and shell tools are `read`, `write`, `edit`, `glob`, `grep`, `bash`.
- The dsh `workflow` tool runs JavaScript orchestration. The profile saves the bundle's
  `paper-writing` workflow by name; every node prompt is embedded in the script, so the script never
  enters your context and no node depends on registered agent types.
- **Mapping rule.** Wherever this skill says `Workflow({name: "science-agent:paper-writing", args})`,
  call `workflow({name: "paper-writing", args})` with the same args minus `agentPrefix` and
  `useAgentTypes`. If the `workflow` tool refuses (for example `unknown saved workflow
  "paper-writing"`), report its error verbatim, say that the dsh server must be restarted to load
  the profile's saved workflows, and stop: do not write the paper by hand, because that run would
  have no audit and no Notebook view. Only when the `workflow` tool is absent from your tools, say so
  and do the steps by hand as described below.
- The Notebook view shows each paper run: its stages, sections, figures and tables, audit passes,
  open issues, review, and the PDF, which opens in the right sidebar.
