#!/bin/bash
# agentic-dev SessionStart Hook - 会话启动环境检查
# 由 ad-init 自动生成，可按项目需求自定义
#
# 检查内容:
#   1. 项目目录验证（.git、CLAUDE.md 存在性）
#   2. 配置文件检查（.claude/ad.local.md）
#   3. 工具可用性检测（glab、jq、python3）
#   4. 远程状态同步（git fetch）
#   5. 活跃 worktree 列表
#
# 注意: 所有检查失败仅输出警告，不阻塞会话启动

set -euo pipefail

NL=$'\n'
status_lines=""
warnings=""

# --- 1. 项目目录验证 ---
if git rev-parse --git-dir &>/dev/null; then
    status_lines="${status_lines}  Git: OK${NL}"
else
    warnings="${warnings}${NL}- Not a git repository."
fi

if [[ -f "CLAUDE.md" ]]; then
    status_lines="${status_lines}  CLAUDE.md: OK${NL}"
else
    warnings="${warnings}${NL}- CLAUDE.md not found."
fi

# --- 2. 配置文件检查 ---
if [[ -f ".claude/ad.local.md" ]]; then
    status_lines="${status_lines}  ad.local.md: OK${NL}"
else
    warnings="${warnings}${NL}- .claude/ad.local.md not found. Run /ad:ad-init to initialize."
fi

# --- 3. 工具可用性检测 ---
for tool in glab jq python3; do
    if command -v "$tool" &>/dev/null; then
        status_lines="${status_lines}  ${tool}: OK${NL}"
    else
        warnings="${warnings}${NL}- ${tool} not found."
    fi
done

# --- 4. 远程状态同步 ---
if git rev-parse --git-dir &>/dev/null; then
    if git fetch origin --quiet 2>/dev/null; then
        status_lines="${status_lines}  git fetch: OK${NL}"
    else
        warnings="${warnings}${NL}- git fetch failed."
    fi
fi

# --- 5. 活跃 worktree 列表 ---
worktree_info=""
if git rev-parse --git-dir &>/dev/null; then
    worktree_count=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$worktree_count" -gt 1 ]]; then
        worktree_list=$(git worktree list 2>/dev/null | tail -n +2 | while read -r path hash branch; do
            dir=$(basename "$path")
            echo "  - ${dir} ${branch}"
        done)
        worktree_info="Active worktrees (${worktree_count}):${NL}${worktree_list}"
    fi
fi

# --- 构建状态报告 ---
report="Environment check completed."
if [[ -n "$status_lines" ]]; then
    report="${report}${NL}${NL}Status:${NL}${status_lines}"
fi
if [[ -n "$worktree_info" ]]; then
    report="${report}${NL}${worktree_info}"
fi
if [[ -n "$warnings" ]]; then
    report="${report}${NL}${NL}Warnings:${warnings}"
fi

# --- 输出 JSON ---
if command -v jq &>/dev/null; then
    jq -n --arg ctx "$report" '{
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": ("SessionStart hook success: " + $ctx)
        }
    }'
else
    escaped_report=$(printf '%s' "$report" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk '{printf "%s\\n", }' | sed 's/\\n$//')
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"SessionStart hook success: ${escaped_report}\"}}"
fi

exit 0
