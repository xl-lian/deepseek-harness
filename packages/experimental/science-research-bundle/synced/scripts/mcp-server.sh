#!/usr/bin/env bash
set -euo pipefail
ws="${SA_WORKSPACE:-$PWD}"
if command -v sagent >/dev/null 2>&1; then
  exec sagent mcp serve --workspace "$ws" --transport stdio
fi
for candidate in "$HOME/.local/bin/sagent" "$HOME/.cargo/bin/sagent"; do
  if [ -x "$candidate" ]; then
    exec "$candidate" mcp serve --workspace "$ws" --transport stdio
  fi
done
echo "science-agent: 'sagent' not found. Install the toolkit first (see README)." >&2
exit 1
