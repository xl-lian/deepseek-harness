#!/usr/bin/env python3
"""UserPromptSubmit hook: an experiment request starts a round, not a chat.

A model can spend a turn scouting manually instead of launching the audited
round. When the prompt asks to continue or run experiments in a workspace that
has ``.sa``, this hook adds that instruction directly to the model context for
the turn.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

EXPERIMENT_REQUEST = re.compile(
    r"(继续实验|继续跑实验|继续后续实验|接着跑|跑一轮|继续.{0,6}实验|"
    r"continue.{0,20}experiment|run (another|the next) round)",
    re.IGNORECASE,
)

CONTEXT = "EXPERIMENT REQUEST (science-agent): start a campaign in this turn. Call the `workflow` tool with {name: \"science-campaign\", args: {workspace, saBin: \"sagent\", roundArgs: {maxHypotheses, maxRuns, runTimeoutSec, templatesDir}}}. Do not answer with a summary or a plan first, and do not call sa_scout / sa_hypothesis / sa_engineer directly; the campaign owns round begin, scout/hypotheses/engineer/verify, and `sagent round close` (decide, claims, report, outcome, stop rules)."


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
    if not EXPERIMENT_REQUEST.search(prompt) or not workspace_has_sa(cwd):
        return
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": CONTEXT,
                }
            }
        )
    )


if __name__ == "__main__":
    main()
