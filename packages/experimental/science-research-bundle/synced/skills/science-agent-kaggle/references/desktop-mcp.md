# Claude Desktop and MCP

Claude Desktop cannot load Claude Code skills, Workflow scripts, subagents, commands, or hooks. It
gets a separate, deliberately coarse MCP server implemented in `src/science_agent/mcp_server.py`.
The server calls the same `science_agent.api` facade as the CLI; it does not shell out to Typer.

## 1. What Desktop can and cannot do

| Capability | Desktop via MCP | Claude Code |
|---|---|---|
| Read workspace status and briefing | Yes | Yes |
| Create/lock an objective | Yes | Yes |
| Download/freeze/profile data | Yes (best effort) | Yes |
| Create/status a holdout | Yes | Yes |
| Add/list hypotheses | Yes | Yes |
| Start a run on an existing code directory | Yes | Yes |
| Write model code | Yes, via `sa_experiment_write` (path-validated) | Yes (engineer agent) |
| Run L0–L4 verification | Yes | Yes |
| Decide, sync claims, build report | Yes | Yes |
| Multi-agent fan-out | No | Yes (Workflow) |
| Holdout reveal | No (no token parameter) | Yes, in a terminal |
| Upload a submission | No | Yes, in a terminal with a token |
| Create an approval token | No | Yes, in a terminal |

Desktop is an orchestrator and reader. It cannot implement a hypothesis from scratch. Use Claude Code
or another editor to create the experiment directory, then have Desktop start and verify runs.

## 2. Setup

Install the toolkit with the MCP extra:

```bash
cd /Users/xiaoleilian/Projects/science-agent
uv tool install --python 3.13 --from . "science-agent-toolkit[ml,mcp]"
```

Initialize a workspace and print the config:

```bash
sagent init --workspace ~/kaggle/s6e1 --competition playground-series-s6e1 --type tabular
sagent mcp config --workspace ~/kaggle/s6e1 --json
```

`sagent mcp config` prints the `mcpServers` block; there is no `--print` flag in the current CLI. The
`--json` form wraps the block in the normal `{ok: true, data: ...}` envelope; the plain form prints it
directly.

The output is:

```json
{
  "mcpServers": {
    "science-agent": {
      "command": "/Users/you/.local/bin/sagent",
      "args": [
        "mcp",
        "serve",
        "--workspace",
        "/Users/you/kaggle/s6e1",
        "--transport",
        "stdio"
      ],
      "env": {
        "SA_WORKSPACE": "/Users/you/kaggle/s6e1"
      }
    }
  }
}
```

Paste the `mcpServers` object into the Claude Desktop configuration file on macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

If the file already has other servers, merge the `science-agent` entry into the existing
`mcpServers` object; do not replace the file. Restart Claude Desktop after saving. The server
resolves the workspace from the `--workspace` argument or `SA_WORKSPACE`; it refuses a directory
without `.sa`.

For a project-local plugin install, `plugin/.mcp.json` uses a launcher script:

```json
{
  "science-agent": {
    "command": "bash",
    "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.sh"]
  }
}
```

That launcher resolves `sagent` on PATH or in `~/.local/bin` and `~/.cargo/bin`.

## 3. The 18 MCP tools

`sa_research` serves the research loop's thin tools (see the `science-research` skill); the other 17 are described here.

The tool set is coarse on purpose. Each tool has an `action` argument instead of one tool per CLI
command, which keeps the schema small.

| Tool | Actions | Read-only | Destructive | Notes |
|---|---|---|---|---|
| `sa_status` | `workspace`, `round`, `briefing` | yes | no | Workspace status, a round, or the next-round briefing. |
| `sa_objective` | `create`, `get`, `lock` | no | no | `data` is the objective mapping for `create`. |
| `sa_data` | `info`, `download`, `profile`, `freeze`, `prepare`, `verify` | no | no | Best-effort Kaggle metadata. |
| `sa_holdout` | `create`, `status` | no | yes | Labels never enter the workspace. |
| `sa_hypothesis` | `add`, `list`, `show` | no | no | `add` requires `statement`. |
| `sa_run` | `start`, `status`, `list`, `logs` | no | yes | `start` executes code in the sandbox and returns run IDs. |
| `sa_experiment_write` | — | no | no | Write `main.py`/`run.yaml` under `experiments/<round>/<hypothesis>/`; path-validated. |
| `sa_verify` | `run`, `design`, `report` | no | no | L0–L4 by default; no holdout token parameter. |
| `sa_claim` | `add`, `list`, `sync`, `audit` | no | no | |
| `sa_search` | `next`, `curve` | yes | no | |
| `sa_decide` | — | no | no | Deterministic ranking. |
| `sa_report` | `build`, `check` | no | no | `check` uses strict mode. |
| `sa_submit` | `validate`, `prepare`, `list` | no | no | Upload is intentionally absent. |
| `sa_round` | `begin`, `next`, `status`, `stage`, `end` | no | no | Round state machine. |
| `sa_cost` | `summary`, `record` | no | no | Agent token cost is not measured automatically. |
| `sa_ledger` | `verify`, `anchor`, `explain` | yes | no | |
| `sa_guide` | — | yes | no | Returns the protocol text and is also the server's instructions. |

All tools return JSON as a string. On an `SAError`, they return `{"error": "<code>", "message": "..."}`
rather than raising across the MCP boundary. The annotations use `readOnlyHint`, `destructiveHint`,
`idempotentHint: false`, and `openWorldHint: false`.

## 4. Round state machine

The intended Desktop flow is `begin → next → stage → end`. The states are persisted through `sagent`
events, not in the MCP server's memory.

### 4.1 Begin

```text
sa_round(action="begin", mode="full")
```

Calls `api.round_begin`. It returns a round object:

```json
{
  "round_id": "rd-1a2b3c4d5e",
  "objective_id": "obj-...",
  "mode": "full",
  "controller": "tree",
  "stages": [
    {"name": "scout", "status": "pending"},
    {"name": "hypotheses", "status": "pending"},
    {"name": "execute", "status": "pending"},
    {"name": "verify", "status": "pending"},
    {"name": "decide", "status": "pending"},
    {"name": "report", "status": "pending"}
  ],
  "budget": {},
  "outcome": "running"
}
```

The MCP tool does not expose the `controller` argument; it uses the default `tree`.

### 4.2 Next

```text
sa_round(action="next", round_id="rd-1a2b3c4d5e")
```

Returns the first stage whose status is `pending` or `running`, plus stage-specific instructions:

```json
{
  "done": false,
  "round_id": "rd-...",
  "next_stage": "scout",
  "instructions": {
    "goal": "Profile the competition data, metric, rules, leakage risks, and baseline status.",
    "commands": ["sagent data profile --adversarial --json", "sagent kaggle info --competition <slug> --json", "sagent state briefing --json"],
    "output": "Structured scout notes and evidence cards; no experiments."
  }
}
```

When every stage is terminal, it returns `{"done": true, "round_id": "...", "round": {...}}`.

`next` does not auto-advance and does not require earlier stages to be complete. If you never mark
`scout` as completed, `next` keeps returning `scout`. The client must call `stage` after doing the
work.

### 4.3 Stage

```text
sa_round(
  action="stage",
  round_id="rd-1a2b3c4d5e",
  stage="scout",
  status="completed",
  summary="profile complete; stratified CV recommended"
)
```

Valid stage names are `scout`, `hypotheses`, `execute`, `verify`, `decide`, and `report`. Valid
statuses are `pending`, `running`, `completed`, `failed`, and `skipped`. The MCP tool does not set
the `agent` field; use the CLI if you need it.

### 4.4 End

```text
sa_round(action="end", round_id="rd-1a2b3c4d5e", status="improved")
```

Calls `api.round_end` with the `status` value as the outcome. The MCP tool does not expose
`best_run_id` or `next_recommendation`; use `sagent round end ... --best-run ... --next ...` in a
terminal if you need those fields.

### 4.5 What the state machine does not enforce

- There is no `complete` action.
- `end` does not refuse to close a round whose required stages are pending.
- `next` does not verify that the previous stage passed a gate.
- The stages are a checklist for the model and the human, not a hard security boundary.

The hard guarantees remain in `sagent verify`, `sagent decide`, the submission gate, and the sandbox. A
Desktop client that skips `verify` will get a decision with eliminated candidates (`no_verdict`),
not a verified result.

## 5. Guide prompt

`sa_guide` returns this protocol, and the same text is the server's `instructions`:

```text
Science-agent protocol (Kaggle):
1. sa_status(action=workspace) and sa_status(action=briefing).
2. sa_round(action=begin) -> follow next_stage instructions.
3. scout: sa_data(profile), sa_data(freeze), sa_holdout(create/status).
4. hypotheses: sa_hypothesis(add), sa_run(start).
5. verify: sa_verify(run) for every run; never trust reported metrics.
6. decide: sa_decide then sa_claim(sync).
7. report: sa_report(build), check the path.
8. Submission: sa_submit(validate/prepare), then a human runs `sagent approve` in a terminal.
Never read holdout labels, never edit .sa/ledger or .sa/objects, never submit without approval.
```

The guide is a prompt, not a verifier. The server still relies on `sagent` for every gate.

## 6. Resources

The current `mcp_server.py` registers **no MCP resources**. The design intended resources such as
`science-agent://guide`, `science-agent://state/briefing`, and `science-agent://report/latest`, but
they are not implemented. Use the tools instead:

- guide: `sa_guide`
- briefing: `sa_status(action="briefing")`
- report: `sa_status(action="workspace")` for the path, then read it in the client, or call
  `sa_report(action="check", out="<path>")`.

If a client expects a resource URI and finds none, that is expected for this version.

## 7. Why upload and holdout reveal need a terminal token

The MCP surface deliberately cannot perform the two irreversible external actions:

- `sa_submit` exposes `validate`, `prepare`, and `list`; there is no `upload`.
- `sa_verify` exposes `run`, `design`, and `report`; there is no `holdout_token` parameter.

A human must run `sagent approve` in a terminal:

```bash
# Submission (after `sagent submit prepare`)
TOKEN=$(sagent approve --action submit --ttl 10 --json)

# Holdout reveal
TOKEN=$(sagent approve --action holdout-reveal --ttl 10 --json)
```

The token is a `secrets.token_urlsafe(24)` value. Only its SHA-256 is stored, in
`.sa/private/approvals/<token_hash>.json` (directory `0700`, file `0600`), and an
`approval.granted` event is appended with actor `human`. The payload binds:

- `action` (`submit` or `holdout-reveal`);
- `subject_hash` (the submission file SHA-256, or the holdout `sha256_labels`);
- `expires_at` (the TTL, default 10 minutes);
- `granted_at`.

`sagent submit upload` verifies the action, subject hash, and expiry, then checks the submission file
hash again and the public submission limit before calling the Kaggle CLI. `sagent verify run
--holdout-token` verifies the token, re-hashes the labels, and evaluates the holdout. A changed
submission file or a changed holdout invalidates the token.

Two consequences:

1. The model cannot mint its own permission. The token exists only in the human's terminal, and the
   MCP server never receives it.
2. The token is consumed by the gated action (upload or holdout reveal) and cannot be reused. Keep
   the TTL short and do not paste the token into chat or logs. The submission count limit still
   prevents unbounded uploads.

## 8. A Desktop session

```text
Human: Start a science-agent round on ~/kaggle/s6e1.

Claude:
1. sa_status(action="workspace")
2. sa_status(action="briefing")
3. sa_round(action="begin", mode="full") -> rd-...
4. sa_round(action="next", round_id="rd-...") -> scout
5. sa_data(action="profile", adversarial=true)
6. sa_holdout(action="status")
7. sa_round(action="stage", round_id="rd-...", stage="scout", status="completed")
8. sa_hypothesis(action="add", statement="...", prediction="...")
9. sa_experiment_write(round_id="rd-...", hypothesis_id="h-...", code="<main.py>")
10. sa_run(action="start", code_dir="experiments/rd-.../h-...", seeds=[42,43,44], round_id="rd-...")
10. For each run id: sa_verify(action="run", run_id="r-...")
11. sa_round(action="stage", ..., stage="verify", status="completed")
12. sa_verify(action="design", round_id="rd-...")
13. sa_decide(round_id="rd-...")
14. sa_claim(action="sync", round_id="rd-...")
15. sa_report(action="build", round_id="rd-...")
16. sa_report(action="check", out="reports/rounds/rd-.../report.md")
17. sa_round(action="stage", ..., stage="report", status="completed")
18. sa_round(action="end", round_id="rd-...", status="improved")
```

For a submission, stop after step 16. Run `sagent submit validate` and `sagent submit prepare` in the
terminal (or via MCP for validate/prepare), then have the human approve and upload in the terminal.
For a holdout, the entire reveal happens in the terminal.

## 9. Operational notes

- **Long runs.** `sa_run(action="start")` calls `api.run_start`, which executes the run
  synchronously and returns after it finishes. There is no asynchronous `start` plus `wait` in this
  implementation. A run can take up to `timeout_s` (default 1800 seconds) and may exceed a client's
  tool timeout. Prefer a shorter `timeout_s` for Desktop, or run long jobs from a terminal.
- **No progress notifications.** The server does not stream progress. Poll `sa_run(action="status")`
  only if you have another process that created the run; a synchronous `start` does not return early.
- **Workspace boundary.** `_ws` resolves the workspace and requires `.sa`. There is no arbitrary
  shell tool. Paths passed to tools are interpreted by the underlying API; do not pass a path outside
  the workspace expecting a sandbox.
- **No skills.** Desktop does not see `SKILL.md`, the references, the agents, or the commands. The
  `sa_guide` text and this document are the protocol.
- **No Workflow.** Desktop cannot call `kaggle-round.js`. It must drive stages manually or use the
  terminal/Claude Code for the multi-agent round.
- **Restart after config changes.** Claude Desktop reads the config at startup.
