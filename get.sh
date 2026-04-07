#!/usr/bin/env bash
set -euo pipefail

REPO="ssh://git@10.10.2.124:2222/junchi.ren/claude-hud.git"
TARGET="${HOME}/.claude/plugins/claude-hud"

echo "=== claude-hud bootstrap ==="
echo ""

if [ -d "$TARGET/.git" ]; then
  echo "Updating existing installation..."
  git -C "$TARGET" pull --ff-only
elif [ -d "$TARGET" ]; then
  echo "Directory exists but is not a git repo. Re-cloning..."
  rm -rf "$TARGET"
  git clone "$REPO" "$TARGET"
else
  echo "Fresh install..."
  mkdir -p "$(dirname "$TARGET")"
  git clone "$REPO" "$TARGET"
fi

exec "$TARGET/install.sh"
