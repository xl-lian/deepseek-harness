#!/usr/bin/env python3
"""UserPromptSubmit hook: an experiment request starts a round, not a chat.

A model can spend a turn scouting manually instead of launching the audited
round. When the prompt asks to continue or run experiments in a workspace that
has ``.sa``, this hook adds that instruction directly to the model context for
the turn. In a folder without ``.sa`` it adds the intake instruction instead,
so hand-run experiments in such a folder are not continued outside the ledger.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

EXPERIMENT_REQUEST = re.compile(
    r"(继续实验|继续跑实验|继续后续实验|接着跑|跑一轮|继续.{0,6}实验|继续.{0,6}研究|接着研究|"
    r"continue.{0,20}(experiment|research)|run (another|the next) round)",
    re.IGNORECASE,
)

CONTEXT = (
    "EXPERIMENT REQUEST (science-agent): start the loop in this turn. "
    "For a research objective (`sagent domain show --json` reports control=prompt) call "
    "the dsh `workflow` tool with ({name: \"research-loop\", args: {workspace, saBin: \"sagent\", maxRounds}}). "
    "Otherwise call the dsh `workflow` tool with ({name: \"science-campaign\", args: {workspace, saBin: \"sagent\", "
    "roundArgs: {maxHypotheses, maxRuns, runTimeoutSec, templatesDir}}}). "
    "Do not answer with a summary or a plan first, and do not delegate role agents directly; "
    "the workflow owns the rounds and the node agents."
)

NO_WORKSPACE_CONTEXT = (
    "EXPERIMENT REQUEST (science-agent): this folder has no science-agent workspace (`.sa/`), so nothing "
    "here is recorded yet, even if it holds earlier hand-run experiments. Load the matching skill "
    "(science-research for an open question, science-agent-kaggle for a Kaggle competition, science-agent "
    "for another metric, scored, or equation task), do its Intake first, asking the user for anything it "
    "needs, then start its loop. Do not continue the experiments as untracked shell commands."
)


def workspace_has_sa(path: str) -> bool:
    current = Path(path)
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / ".sa").is_dir():
            return True
    return False


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    prompt = str(payload.get("prompt") or "")
    cwd = str(payload.get("cwd") or os.getcwd())
    if not EXPERIMENT_REQUEST.search(prompt):
        return
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": CONTEXT if workspace_has_sa(cwd) else NO_WORKSPACE_CONTEXT,
                }
            }
        )
    )


if __name__ == "__main__":
    main()
