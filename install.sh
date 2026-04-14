#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
MARKETPLACES_FILE="${CLAUDE_DIR}/plugins/known_marketplaces.json"
INSTALLED_FILE="${CLAUDE_DIR}/plugins/installed_plugins.json"

echo "=== cli-hud installer ==="
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
CACHE_DIR="${CLAUDE_DIR}/plugins/cache/cli-hud-local/cli-hud/${VER}"
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

# 7. Register in known_marketplaces.json (and remove conflicting "cli-hud" marketplace if present)
python3 - "$SCRIPT_DIR" "$MARKETPLACES_FILE" <<'PYEOF'
import json, sys, os, shutil
from datetime import datetime, timezone

install_path, mp_file = sys.argv[1], sys.argv[2]

data = {}
if os.path.exists(mp_file):
    with open(mp_file) as f:
        data = json.load(f)

# Remove conflicting third-party "cli-hud" marketplace (e.g. jarrodwatts/cli-hud)
if "cli-hud" in data and data["cli-hud"].get("source", {}).get("source") != "directory":
    loc = data["cli-hud"].get("installLocation", "")
    if loc and os.path.isdir(loc):
        shutil.rmtree(loc, ignore_errors=True)
    del data["cli-hud"]
    print("Removed conflicting cli-hud marketplace")

data["cli-hud-local"] = {
    "source": {"source": "directory", "path": install_path},
    "installLocation": install_path,
    "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
}

with open(mp_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
echo "Registered marketplace: cli-hud-local"

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
data["plugins"]["cli-hud@cli-hud-local"] = [{
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
echo "Registered plugin: cli-hud@cli-hud-local"

# 9. Clean old version cache directories
for old_dir in "$CLAUDE_DIR/plugins/cache/cli-hud-local/cli-hud/"*/; do
  if [ -d "$old_dir" ] && [ "$old_dir" != "$CACHE_DIR/" ]; then
    rm -rf "$old_dir"
  fi
done

# 10. Enable plugin (plugins are disabled by default after manual registration)
claude plugin enable cli-hud@cli-hud-local 2>/dev/null || true

# 11. Configure statusline (use cache dir)
bun "$CACHE_DIR/src/index.ts" enable

# 12. Register auto-update SessionStart hook in user-level settings
python3 - "$SCRIPT_DIR/scripts/auto-update.sh" "${CLAUDE_DIR}/settings.json" <<'PYEOF'
import json, sys, os

update_script, settings_file = sys.argv[1], sys.argv[2]

data = {}
if os.path.exists(settings_file):
    with open(settings_file) as f:
        data = json.load(f)

hooks = data.setdefault("hooks", {})
session_hooks = hooks.setdefault("SessionStart", [])

# 检查是否已注册（避免重复）
hook_command = update_script
already_registered = False
for entry in session_hooks:
    for h in entry.get("hooks", []):
        if h.get("command", "").endswith("auto-update.sh"):
            # 更新为最新路径
            h["command"] = hook_command
            already_registered = True

if not already_registered:
    session_hooks.append({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": hook_command
        }]
    })

with open(settings_file, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
echo "Registered auto-update hook"

echo ""
echo "cli-hud installed successfully!"
echo "  Plugin path: $CACHE_DIR"
echo "  Commands: /cli-hud:enable, /cli-hud:disable, /cli-hud:report, /cli-hud:update"
echo "  Note: Statusline and report changes take effect immediately."
echo "  Restart Claude Code only if commands or hooks were updated."
