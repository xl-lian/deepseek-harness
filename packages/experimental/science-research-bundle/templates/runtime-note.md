Runtime mapping (DeepSeek Harness):
- Model-facing tools are named `read`, `write`, `edit`, `glob`, `grep`, `bash`, `web_search`, `web_fetch`,
  `skill`, `todo_write`, `ask_user_question`, and `mcp__science-agent__*`. Where these instructions say
  Read, Write, Glob, Grep, or Bash, use the lower-case tool of the same purpose.
- The `sagent` CLI remains the canonical state interface. Prefer it over editing files directly.
- Never edit `.sa/`, `runs/`, or the installed science-agent package. The `science-agent` PreToolUse
  hook blocks writes to the ledger, object store, private state, and the installed verifier.
- You are one node of a running research loop. Do not start a workflow or delegate to other agents;
  return only the structured result this prompt asks for.
