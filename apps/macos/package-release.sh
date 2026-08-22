#!/usr/bin/env bash
# Build a GitHub-release zip of the unofficial macOS wrapper.
set -euo pipefail

root=$(cd "$(dirname "$0")" && pwd)
version="${DSH_CLI_VERSION:-0.1.1-rc.2}"
zipname="DeepSeek-Harness-${version}-macos.zip"

"$root/build.sh"
rm -f "$root/build/$zipname"
ditto -c -k --keepParent "$root/build/DeepSeek Harness.app" "$root/build/$zipname"
cp "$root/install-macos.sh" "$root/build/install-macos.sh"
echo "Wrote $root/build/$zipname"
echo "Wrote $root/build/install-macos.sh"
