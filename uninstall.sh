#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
MARKETPLACES_FILE="${CLAUDE_DIR}/plugins/known_marketplaces.json"
INSTALLED_FILE="${CLAUDE_DIR}/plugins/installed_plugins.json"

echo "=== cli-hud uninstaller ==="
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

data.pop("cli-hud-local", None)

with open(mp_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  echo "Removed marketplace: cli-hud-local"
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

data.get("plugins", {}).pop("cli-hud@cli-hud-local", None)

with open(inst_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  echo "Removed plugin: cli-hud@cli-hud-local"
fi

# 4. Remove auto-update hook from user-level settings
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  python3 - "$SETTINGS_FILE" <<'PYEOF'
import json, sys, os

settings_file = sys.argv[1]
if not os.path.exists(settings_file):
    sys.exit(0)

with open(settings_file) as f:
    data = json.load(f)

hooks = data.get("hooks", {})
session_hooks = hooks.get("SessionStart", [])

# 移除包含 auto-update.sh 的 hook 条目
new_session_hooks = []
for entry in session_hooks:
    new_hooks = [h for h in entry.get("hooks", []) if not h.get("command", "").endswith("auto-update.sh")]
    if new_hooks:
        entry["hooks"] = new_hooks
        new_session_hooks.append(entry)

if new_session_hooks:
    hooks["SessionStart"] = new_session_hooks
else:
    hooks.pop("SessionStart", None)

if not hooks:
    data.pop("hooks", None)

with open(settings_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  echo "Removed auto-update hook"
fi

# 5. Clean up update marker files
rm -f "${SCRIPT_DIR}/.update-lock" "${SCRIPT_DIR}/.last-update" "${SCRIPT_DIR}/.update-rollback-sha" "${SCRIPT_DIR}/.last-fetch"

echo ""
echo "cli-hud uninstalled. Please restart Claude Code."
echo "  To delete files: rm -rf $SCRIPT_DIR"
