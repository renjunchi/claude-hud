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

cd "$SCRIPT_DIR"

# 2. Install dependencies
bun install --frozen-lockfile 2>/dev/null || bun install

# 3. Read version and git sha
VER=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/.claude-plugin/plugin.json')).get('version','0.1.0'))" 2>/dev/null || echo "0.1.0")
SHA=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")

# 4. Symlink plugin cache to source tree — dev mode 改一次 src/ 就立即生效，
#    无需 rsync 同步。production 用户走 /plugin marketplace，不经此脚本。
CACHE_DIR="${CLAUDE_DIR}/plugins/cache/cli-hud-local/cli-hud/${VER}"
rm -rf "$CACHE_DIR"
mkdir -p "$(dirname "$CACHE_DIR")"
ln -s "$SCRIPT_DIR" "$CACHE_DIR"

# 5. Ensure plugins directory exists
mkdir -p "${CLAUDE_DIR}/plugins"

# 6. Register in known_marketplaces.json (and remove conflicting "cli-hud" marketplace if present)
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

# 7. Register in installed_plugins.json (point to cache dir)
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

# 8. Clean old version cache directories
for old_dir in "$CLAUDE_DIR/plugins/cache/cli-hud-local/cli-hud/"*/; do
  if [ -d "$old_dir" ] && [ "$old_dir" != "$CACHE_DIR/" ]; then
    rm -rf "$old_dir"
  fi
done

# 9. Enable plugin (plugins are disabled by default after manual registration)
claude plugin enable cli-hud@cli-hud-local 2>/dev/null || true

# 10. Configure statusline (use cache dir)
bun "$CACHE_DIR/src/index.ts" enable

echo ""
echo "cli-hud installed successfully (developer mode)!"
echo "  Plugin path: $CACHE_DIR"
echo "  Marketplace: cli-hud-local (directory source → $SCRIPT_DIR)"
echo "  Commands: /cli-hud:enable, /cli-hud:disable, /cli-hud:report"
echo "  Update flow: src/ 改动即时生效（symlink）；只在 plugin.json 版本号变更后才需重跑 install.sh。"
