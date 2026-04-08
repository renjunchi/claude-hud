#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
MARKETPLACES_FILE="${CLAUDE_DIR}/plugins/known_marketplaces.json"
INSTALLED_FILE="${CLAUDE_DIR}/plugins/installed_plugins.json"

echo "=== claude-hud installer ==="
echo ""

# 1. Check bun
if ! command -v bun &>/dev/null; then
  echo "bun not found. Install it first:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# 2. Reset working tree to match HEAD (in case local files were modified)
cd "$SCRIPT_DIR"
git checkout -- . 2>/dev/null || true

# 3. Install dependencies
bun install --frozen-lockfile 2>/dev/null || bun install

# 4. Ensure plugins directory exists
mkdir -p "${CLAUDE_DIR}/plugins"

# 4. Register in known_marketplaces.json
python3 - "$SCRIPT_DIR" "$MARKETPLACES_FILE" <<'PYEOF'
import json, sys, os
from datetime import datetime, timezone

install_path, mp_file = sys.argv[1], sys.argv[2]

data = {}
if os.path.exists(mp_file):
    with open(mp_file) as f:
        data = json.load(f)

data["claude-hud-local"] = {
    "source": {"source": "directory", "path": install_path},
    "installLocation": install_path,
    "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
}

with open(mp_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
echo "Registered marketplace: claude-hud-local"

# 5. Register in installed_plugins.json
python3 - "$SCRIPT_DIR" "$INSTALLED_FILE" <<'PYEOF'
import json, sys, os, subprocess
from datetime import datetime, timezone

install_path, inst_file = sys.argv[1], sys.argv[2]

data = {"version": 2, "plugins": {}}
if os.path.exists(inst_file):
    with open(inst_file) as f:
        data = json.load(f)

# Read version from plugin.json
try:
    with open(os.path.join(install_path, ".claude-plugin", "plugin.json")) as f:
        ver = json.load(f).get("version", "0.1.0")
except Exception:
    ver = "0.1.0"

# Read git commit sha
try:
    sha = subprocess.check_output(
        ["git", "-C", install_path, "rev-parse", "HEAD"],
        text=True, stderr=subprocess.DEVNULL
    ).strip()
except Exception:
    sha = "unknown"

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
data["plugins"]["claude-hud@claude-hud-local"] = [{
    "scope": "user",
    "installPath": install_path,
    "version": ver,
    "installedAt": now,
    "lastUpdated": now,
    "gitCommitSha": sha
}]

with open(inst_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
echo "Registered plugin: claude-hud@claude-hud-local"

# 6. Configure statusline
bun "$SCRIPT_DIR/src/index.ts" enable

echo ""
echo "claude-hud installed successfully!"
echo "  Commands: /claude-hud:enable, /claude-hud:disable, /claude-hud:report"
echo "  Please restart Claude Code to activate."
