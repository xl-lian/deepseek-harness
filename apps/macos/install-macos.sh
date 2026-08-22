#!/usr/bin/env bash
# One-shot unofficial macOS install: global dsh CLI + /Applications wrapper.
# Not an official DeepSeek Harness product.
set -euo pipefail

REPO="${DSH_MACOS_REPO:-xl-lian/deepseek-harness}"
TAG="${DSH_MACOS_TAG:-macos-v0.1.1-rc.2}"
CLI_VERSION="${DSH_CLI_VERSION:-0.1.1-rc.2}"
ASSET="DeepSeek-Harness-${CLI_VERSION}-macos.zip"
DEST="/Applications/DeepSeek Harness.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js (with npm) is required. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi

echo "Installing @deepseek-ai/dsh@${CLI_VERSION}…"
npm install -g "@deepseek-ai/dsh@${CLI_VERSION}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download the app." >&2
  exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
zip="$tmpdir/$ASSET"
url="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
echo "Downloading ${url}…"
curl -fL --retry 3 -o "$zip" "$url"

ditto -x -k "$zip" "$tmpdir/unpacked"
app=$(find "$tmpdir/unpacked" -name '*.app' -maxdepth 3 | head -n 1)
if [[ -z "$app" ]]; then
  echo "The downloaded zip did not contain a .app bundle." >&2
  exit 1
fi

xattr -cr "$app" 2>/dev/null || true
rm -rf "$DEST"
cp -R "$app" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true

echo "Installed ${DEST}"
open "$DEST"
