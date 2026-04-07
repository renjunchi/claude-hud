#!/bin/bash
# agentic-dev PostToolUse(Edit|Write) Hook - 代码编辑后自动检查
# 由 ad-init 自动生成，可按项目需求自定义
#
# 输入: stdin JSON (包含 tool_input)
# 输出: 检查通过 exit 0（无输出），有警告则输出 JSON systemMessage
#
# 注意: 检查失败仅输出警告，不阻塞编辑操作

set -euo pipefail

FILE_PATH="${1:-}"
if [[ -z "$FILE_PATH" ]]; then
    input=""
    if read -t 1 -r first_line 2>/dev/null; then
        input="${first_line}$(cat 2>/dev/null || true)"
    fi
    if [[ -n "$input" ]]; then
        FILE_PATH=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null || true)
    fi
fi

[[ -z "$FILE_PATH" ]] && exit 0
[[ ! -f "$FILE_PATH" ]] && exit 0

warnings=""

case "$FILE_PATH" in
    *.yaml|*.yml)
        if command -v python3 &>/dev/null; then
            yaml_err=$(python3 -c "
import yaml, sys
try:
    with open(sys.argv[1]) as f: yaml.safe_load(f)
except yaml.YAMLError as e: print(str(e)[:200])
except Exception: pass
" "$FILE_PATH" 2>/dev/null || true)
            [[ -n "$yaml_err" ]] && warnings="YAML syntax error in $(basename "$FILE_PATH"): ${yaml_err}"
        fi
        ;;
    *.md)
        if head -1 "$FILE_PATH" 2>/dev/null | grep -q '^---$'; then
            if command -v python3 &>/dev/null; then
                fm_err=$(python3 -c "
import sys
content = open(sys.argv[1]).read()
parts = content.split('---', 2)
if len(parts) < 3: print('Unclosed frontmatter: missing closing ---')
" "$FILE_PATH" 2>/dev/null || true)
                [[ -n "$fm_err" ]] && warnings="Markdown frontmatter issue in $(basename "$FILE_PATH"): ${fm_err}"
            fi
        fi
        ;;
    *.sh|*.bash)
        if command -v bash &>/dev/null; then
            sh_err=$(bash -n "$FILE_PATH" 2>&1 || true)
            [[ -n "$sh_err" ]] && warnings="Shell syntax error in $(basename "$FILE_PATH"): ${sh_err}"
        fi
        ;;
    *.json)
        if command -v jq &>/dev/null; then
            json_err=$(jq empty "$FILE_PATH" 2>&1 || true)
            [[ -n "$json_err" ]] && warnings="JSON syntax error in $(basename "$FILE_PATH"): ${json_err}"
        elif command -v python3 &>/dev/null; then
            json_err=$(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f: json.load(f)
except json.JSONDecodeError as e: print(str(e)[:200])
" "$FILE_PATH" 2>/dev/null || true)
            [[ -n "$json_err" ]] && warnings="JSON syntax error in $(basename "$FILE_PATH"): ${json_err}"
        fi
        ;;
    *.py)
        if command -v python3 &>/dev/null; then
            py_err=$(python3 -c "
import py_compile, sys
try: py_compile.compile(sys.argv[1], doraise=True)
except py_compile.PyCompileError as e: print(str(e)[:200])
" "$FILE_PATH" 2>/dev/null || true)
            [[ -n "$py_err" ]] && warnings="Python syntax error in $(basename "$FILE_PATH"): ${py_err}"
        fi
        ;;
esac

if [[ -n "$warnings" ]]; then
    if command -v jq &>/dev/null; then
        jq -n --arg msg "$warnings" '{"systemMessage": $msg}'
    else
        escaped=$(printf '%s' "$warnings" | sed 's/\\/\\\\/g; s/"/\\"/g')
        echo "{\"systemMessage\":\"${escaped}\"}"
    fi
fi

exit 0
