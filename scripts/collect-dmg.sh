#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/release"
mkdir -p "$OUT_DIR"

DMG=$(find "$ROOT/src-tauri/target" -path '*/release/bundle/dmg/*.dmg' -print -quit)
if [ -z "$DMG" ]; then
  echo "DMG not found under src-tauri/target" >&2
  find "$ROOT/src-tauri/target" -type f -name '*.dmg' 2>/dev/null || true
  exit 1
fi

NAME="${1:-$(basename "$DMG")}"
DEST="$OUT_DIR/$NAME"
cp -f "$DMG" "$DEST"
echo "release/$NAME"
