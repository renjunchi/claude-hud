---
description: Manually check and update cli-hud to the latest version
allowed-tools: Bash, Read
---

Manually update cli-hud plugin to the latest version.

## Steps

1. Check if it's a git install and fetch remote:

```bash
PLUGIN_DIR="${HOME}/.claude/plugins/cli-hud"
if [ ! -d "$PLUGIN_DIR/.git" ]; then
  echo "ERROR: Not a git install, cannot update."
  exit 1
fi
LOCAL_SHA=$(git -C "$PLUGIN_DIR" rev-parse HEAD 2>/dev/null)
echo "当前版本: ${LOCAL_SHA:0:7}"
echo "正在检查远程更新..."
git -C "$PLUGIN_DIR" fetch origin 2>&1
REMOTE_SHA=$(git -C "$PLUGIN_DIR" rev-parse origin/main 2>/dev/null)
echo "远程版本: ${REMOTE_SHA:0:7}"
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "✓ 已是最新版本 (${LOCAL_SHA:0:7})"
else
  echo "发现新版本: ${LOCAL_SHA:0:7} → ${REMOTE_SHA:0:7}"
fi
```

2. If the output shows "已是最新版本", tell the user cli-hud is already up to date and stop here.

3. If a new version is found, pull and reinstall:

```bash
PLUGIN_DIR="${HOME}/.claude/plugins/cli-hud"
LOCAL_SHA=$(git -C "$PLUGIN_DIR" rev-parse HEAD)
echo "正在更新..."
if ! git -C "$PLUGIN_DIR" pull --ff-only 2>&1; then
  echo "ERROR: pull --ff-only 失败，可能存在本地修改冲突"
  git -C "$PLUGIN_DIR" reset --hard "$LOCAL_SHA" 2>/dev/null
  exit 1
fi
echo "正在重新安装..."
"$PLUGIN_DIR/install.sh"
NEW_SHA=$(git -C "$PLUGIN_DIR" rev-parse HEAD)
echo ""
echo "✓ 更新完成: ${LOCAL_SHA:0:7} → ${NEW_SHA:0:7}"

# 智能判断是否需要重启
CHANGED_FILES=$(git -C "$PLUGIN_DIR" diff --name-only "$LOCAL_SHA" "$NEW_SHA" 2>/dev/null || echo "")
if echo "$CHANGED_FILES" | grep -qE '^(commands/|\.claude/)'; then
  echo "请重启 Claude Code 以激活新版本（检测到 commands 或 hooks 变更）。"
else
  echo "✓ 更新已即时生效，无需重启。"
fi
```

4. Tell the user the update result based on the command output.
