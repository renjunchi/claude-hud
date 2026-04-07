#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
MARKETPLACES_FILE="${CLAUDE_DIR}/plugins/known_marketplaces.json"
INSTALLED_FILE="${CLAUDE_DIR}/plugins/installed_plugins.json"

echo "=== claude-hud uninstaller ==="
echo ""

# 1. Remove statusline configuration
if command -v bun &>/dev/null; then
  bun "$SCRIPT_DIR/src/index.ts" disable 2>/dev/null || true
fi

# 2. Remove from known_marketplaces.json
if [ -f "$MARKETPLACES_FILE" ]; then
  python3 - "$MARKETPLACES_FILE" <<'PYEOF'
import json, sys, os

mp_file = sys.argv[1]
if not os.path.exists(mp_file):
    sys.exit(0)

with open(mp_file) as f:
    data = json.load(f)

data.pop("claude-hud-local", None)

with open(mp_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  echo "Removed marketplace: claude-hud-local"
fi

# 3. Remove from installed_plugins.json
if [ -f "$INSTALLED_FILE" ]; then
  python3 - "$INSTALLED_FILE" <<'PYEOF'
import json, sys, os

inst_file = sys.argv[1]
if not os.path.exists(inst_file):
    sys.exit(0)

with open(inst_file) as f:
    data = json.load(f)

data.get("plugins", {}).pop("claude-hud@claude-hud-local", None)

with open(inst_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  echo "Removed plugin: claude-hud@claude-hud-local"
fi

echo ""
echo "claude-hud uninstalled. Please restart Claude Code."
echo "  To delete files: rm -rf $SCRIPT_DIR"
