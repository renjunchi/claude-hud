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

# 4. Read version and git sha
VER=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/.claude-plugin/plugin.json')).get('version','0.1.0'))" 2>/dev/null || echo "0.1.0")
SHA=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")

# 5. Copy plugin to cache directory (mirroring how Claude Code manages plugins)
CACHE_DIR="${CLAUDE_DIR}/plugins/cache/claude-hud-local/claude-hud/${VER}"
rm -rf "$CACHE_DIR"
mkdir -p "$CACHE_DIR"
# Copy plugin files (exclude .git, node_modules, docs, tests)
rsync -a --exclude='.git' --exclude='node_modules' --exclude='docs' \
  --exclude='*.test.ts' --exclude='.agentic-dev.yaml' \
  "$SCRIPT_DIR/" "$CACHE_DIR/"
# Install dependencies in cache dir
cd "$CACHE_DIR"
bun install --frozen-lockfile 2>/dev/null || bun install

# 6. Ensure plugins directory exists
mkdir -p "${CLAUDE_DIR}/plugins"

# 7. Register in known_marketplaces.json (and remove conflicting "claude-hud" marketplace if present)
python3 - "$SCRIPT_DIR" "$MARKETPLACES_FILE" <<'PYEOF'
import json, sys, os, shutil
from datetime import datetime, timezone

install_path, mp_file = sys.argv[1], sys.argv[2]

data = {}
if os.path.exists(mp_file):
    with open(mp_file) as f:
        data = json.load(f)

# Remove conflicting third-party "claude-hud" marketplace (e.g. jarrodwatts/claude-hud)
if "claude-hud" in data and data["claude-hud"].get("source", {}).get("source") != "directory":
    loc = data["claude-hud"].get("installLocation", "")
    if loc and os.path.isdir(loc):
        shutil.rmtree(loc, ignore_errors=True)
    del data["claude-hud"]
    print("Removed conflicting claude-hud marketplace")

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

# 8. Register in installed_plugins.json (point to cache dir)
python3 - "$CACHE_DIR" "$VER" "$SHA" "$INSTALLED_FILE" <<'PYEOF'
import json, sys, os
from datetime import datetime, timezone

cache_dir, ver, sha, inst_file = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

data = {"version": 2, "plugins": {}}
if os.path.exists(inst_file):
    with open(inst_file) as f:
        data = json.load(f)

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
data["plugins"]["claude-hud@claude-hud-local"] = [{
    "scope": "user",
    "installPath": cache_dir,
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

# 9. Configure statusline (use cache dir)
bun "$CACHE_DIR/src/index.ts" enable

echo ""
echo "claude-hud installed successfully!"
echo "  Plugin path: $CACHE_DIR"
echo "  Commands: /claude-hud:enable, /claude-hud:disable, /claude-hud:report"
echo "  Please restart Claude Code to activate."
