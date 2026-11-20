#!/usr/bin/env python3
"""PreToolUse guard for the science-agent plugin.

Blocks direct edits to the ledger/CAS/private state, the hidden holdout, and the
installed verifier, and blocks shell commands that bypass the submission gate.
Hooks are defense in depth; the core guarantees remain in the package sandbox
and the hash-chained ledger.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

DENY_PATH_PARTS = (
    "/.sa/ledger",
    "/.sa/objects",
    "/.sa/manifests",
    "/.sa/private",
    "/.sa/state.json",
    "/.sa/holdouts.json",
    "/science_agent/verifiers",
    "/site-packages/science_agent/verifiers",
    # Quote checking for research citations.
    "/site-packages/science_agent/retrieval",
)

DENY_BASH = [
    re.compile(r"\brm\s+-rf?\s+[^\n]*\.sa\b"),
    re.compile(r">\s*[^\n]*\.sa/ledger"),
    re.compile(r"\b(kaggle|kaggle-cli)\s+(competitions?\s+)?submit\b"),
    re.compile(r"\bchmod\s+[^\n]*data/raw"),
    re.compile(r"\bpython[^\n]*holdouts?/"),
]


def sa_root(path: str | Path) -> Path | None:
    """The workspace (the nearest directory holding ``.sa/``) that contains ``path``, if any."""
    current = Path(path)
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / ".sa").is_dir():
            return candidate
    return None


def workspace_has_sa(path: str) -> bool:
    return sa_root(path) is not None


# Inside a workspace, .sa/ and runs/ are written only by the sagent CLI. config.toml is the one file a
# person (or an agent asked to) may edit, for model routes and limits.
EDITABLE_IN_SA = {".sa/config.toml"}


def protected_part(path: str, cwd: str) -> str | None:
    """``.sa`` or ``runs`` when ``path`` lies under that directory of a workspace, else None."""
    target = Path(os.path.normpath(Path(cwd) / path if not os.path.isabs(path) else path))
    root = sa_root(target.parent)
    if root is None:
        return None
    try:
        rel = target.relative_to(root)
    except ValueError:
        return None
    if rel.parts and rel.parts[0] in (".sa", "runs") and rel.as_posix() not in EDITABLE_IN_SA:
        return rel.parts[0]
    return None


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"science-agent guard: {reason}",
                },
                "reason": f"science-agent guard: {reason}",
                "systemMessage": f"science-agent guard: {reason}",
            }
        )
    )
    sys.exit(0)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    tool = str(payload.get("tool_name") or payload.get("tool") or "").lower()
    tool_input = payload.get("tool_input") or {}
    cwd = payload.get("cwd") or os.getcwd()
    if tool in {"write", "edit", "multiedit"}:
        path = str(tool_input.get("file_path") or tool_input.get("path") or "")
        # Checked wherever the session runs: the target's own workspace decides.
        part = protected_part(path, cwd) if path else None
        if part:
            deny(f"{part}/ in a science-agent workspace is written only by the sagent CLI (runs record provenance, .sa holds the ledger)")
    if not workspace_has_sa(cwd) and not any(".sa" in str(v) for v in tool_input.values() if isinstance(v, str)):
        return
    if tool in {"write", "edit", "multiedit"}:
        path = str(tool_input.get("file_path") or tool_input.get("path") or "")
        for part in DENY_PATH_PARTS:
            if part in path:
                deny(f"direct edits to {part} are not allowed; use the sagent CLI")
    if tool == "bash":
        command = str(tool_input.get("command") or "")
        for pattern in DENY_BASH:
            if pattern.search(command):
                deny("this command bypasses the science-agent submission/ledger gate")


if __name__ == "__main__":
    main()
