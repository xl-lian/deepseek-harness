#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")" && pwd)
app="$root/build/DeepSeek Harness.app"
sdk="$(xcrun --sdk macosx --show-sdk-path)"

compile() {
  local arch=$1
  swiftc -O -target "${arch}-apple-macosx12.0" \
    -sdk "$sdk" \
    -framework Cocoa -framework WebKit \
    -o "$root/dsh-desktop-${arch}" "$root/main.swift"
}

compile arm64
compile x86_64
lipo -create -output "$root/dsh-desktop" \
  "$root/dsh-desktop-arm64" "$root/dsh-desktop-x86_64"
rm -f "$root/dsh-desktop-arm64" "$root/dsh-desktop-x86_64"

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
