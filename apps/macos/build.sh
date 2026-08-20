#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")" && pwd)
app="$root/build/DeepSeek Harness.app"

swiftc -O -target arm64-apple-macosx12.0 \
  -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  -framework Cocoa -framework WebKit \
  -o "$root/dsh-desktop" "$root/main.swift"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$root/dsh-desktop" "$app/Contents/MacOS/dsh-desktop"
cp "$root/Info.plist" "$app/Contents/Info.plist"
cp "$root/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
codesign -s - --force --deep "$app"
echo "Built $app"

if [[ "${1:-}" == "install" ]]; then
  dest="/Applications/DeepSeek Harness.app"
  rm -rf "$dest"
  cp -R "$app" "$dest"
  echo "Installed $dest"
fi
