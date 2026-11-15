---
name: sa-paper
description: "Write a LaTeX paper and its PDF from a finished research loop: outline, figures and tables from run outputs, one agent per section, an audit against the record, a referee review, and revision."
user-invocable: true
disable-model-invocation: true
---

# /sa-paper

The user invoked `/sa-paper`. The message text after the command token may name the authors, a target
venue or length, or what to emphasize.

Follow the `science-paper` skill.

1. Preflight: `sagent -w <workspace> research status --json`. Without `research/state.md` or
   `research/report.md`, say that `/sa-research` must run first and stop.
2. Take `authors` and `venue` from the message or the conversation. Never invent an author.
3. Call the dsh `workflow` tool with `name: "paper-writing"` and args `{workspace, saBin, authors,
   venue}`. Do not write sections by hand first. If the tool answers `unknown saved workflow
   "paper-writing"`, the running dsh server predates the paper workflow: report the error verbatim,
   ask the user to restart dsh, and stop.
4. When it returns, read `paper/outline.md`, `paper/audit.md`, and `paper/review.md`.
5. Report in the skill's **Reporting** shape. When `result.compile.reason` is `no-tectonic`, give the
   install command and `sagent -w <workspace> paper compile --json`.

Never edit `.sa/`, `runs/`, or `research/` for the paper.
