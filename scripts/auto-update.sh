#!/usr/bin/env bash
# claude-hud 自动更新脚本
# 作为用户级 SessionStart hook 运行，每次会话启动时检查并后台更新
set -euo pipefail

PLUGIN_DIR="${HOME}/.claude/plugins/claude-hud"
LOCK_FILE="${PLUGIN_DIR}/.update-lock"
LAST_UPDATE_FILE="${PLUGIN_DIR}/.last-update"
LAST_FETCH_FILE="${PLUGIN_DIR}/.last-fetch"
COOLDOWN_SECONDS=3600  # 1 小时冷却时间

# --- 辅助函数 ---

output_json() {
  local msg="$1"
  if command -v jq &>/dev/null; then
    jq -n --arg ctx "$msg" '{
      "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": ("claude-hud auto-update: " + $ctx)
      }
    }'
  else
    local escaped
    escaped=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"claude-hud auto-update: ${escaped}\"}}"
  fi
}

cleanup_lock() {
  rm -f "$LOCK_FILE"
}

# --- 前置检查 ---

# 非 git 安装则跳过
if [ ! -d "$PLUGIN_DIR/.git" ]; then
  output_json "skipped (not a git install)"
  exit 0
fi

# 检查锁文件（防止并发更新）
if [ -f "$LOCK_FILE" ]; then
  lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
    # 更新进程仍在运行
    output_json "skipped (update in progress)"
    exit 0
  fi
  # 锁文件残留（进程已退出），清理
  rm -f "$LOCK_FILE"
fi

# --- 冷却时间检查 ---

if [ -f "$LAST_FETCH_FILE" ]; then
  last_fetch_ts=$(cat "$LAST_FETCH_FILE" 2>/dev/null || echo "0")
  now_ts=$(date +%s)
  elapsed=$(( now_ts - last_fetch_ts ))
  if [ "$elapsed" -lt "$COOLDOWN_SECONDS" ]; then
    output_json "skipped (checked ${elapsed}s ago, cooldown ${COOLDOWN_SECONDS}s)"
    exit 0
  fi
fi

# --- 检测更新 ---

# 获取远程最新状态（静默失败则跳过）
if ! git -C "$PLUGIN_DIR" fetch origin --quiet 2>/dev/null; then
  output_json "skipped (fetch failed, possibly offline)"
  exit 0
fi

# 记录 fetch 时间
date +%s > "$LAST_FETCH_FILE"

LOCAL_SHA=$(git -C "$PLUGIN_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
REMOTE_SHA=$(git -C "$PLUGIN_DIR" rev-parse origin/main 2>/dev/null || echo "unknown")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  output_json "up to date (${LOCAL_SHA:0:7})"
  exit 0
fi

# --- 后台更新 ---

# 写入锁文件（后台进程 PID 在 fork 后写入）
(
  # 使用 $BASHPID 获取子 shell 真实 PID（$$ 是父进程 PID）
  echo "${BASHPID:-$$}" > "$LOCK_FILE"
  trap cleanup_lock EXIT

  # 保存回滚点
  echo "$LOCAL_SHA" > "${PLUGIN_DIR}/.update-rollback-sha"

  # 拉取更新
  if ! git -C "$PLUGIN_DIR" pull --ff-only 2>/dev/null; then
    # ff-only 失败（有冲突），回滚
    git -C "$PLUGIN_DIR" reset --hard "$LOCAL_SHA" 2>/dev/null || true
    exit 1
  fi

  # 重新安装（构建 + 复制到缓存 + 更新注册信息）
  if ! "$PLUGIN_DIR/install.sh" > /dev/null 2>&1; then
    # 安装失败，回滚 git 状态
    git -C "$PLUGIN_DIR" reset --hard "$LOCAL_SHA" 2>/dev/null || true
    exit 1
  fi

  # 记录更新结果
  NEW_SHA=$(git -C "$PLUGIN_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")

  # 智能判断是否需要重启
  CHANGED_FILES=$(git -C "$PLUGIN_DIR" diff --name-only "$LOCAL_SHA" "$NEW_SHA" 2>/dev/null || echo "")
  NEED_RESTART=false
  if echo "$CHANGED_FILES" | grep -qE '^(commands/|\.claude/)'; then
    NEED_RESTART=true
  fi

  cat > "$LAST_UPDATE_FILE" <<EOF
updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
from_sha=$LOCAL_SHA
to_sha=$NEW_SHA
need_restart=$NEED_RESTART
EOF

  # 清理回滚文件（更新成功）
  rm -f "${PLUGIN_DIR}/.update-rollback-sha"
) &

output_json "updating in background (${LOCAL_SHA:0:7} → ${REMOTE_SHA:0:7})"
exit 0
