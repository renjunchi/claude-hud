# claude-hud

[Claude Code](https://claude.ai/code) 终端状态栏 HUD。实时显示上下文窗口、Rate Limits、活跃工具和多会话监控。

```
[Opus 4.6 (1M context)] │ Context ▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱ 15% │ ⎇ main
Current ▰▰▰▱▱▱▱▱▱▱ 32% ↻2 hr 35 min │ All ▰▰▰▰▱▱▱▱▱▱ 43% ↻Thu 10:00 PM
◐ Read │ ✓ Grep x5 │ ✓ Edit x2
+2 sessions: n8n-plugin(5m ago) servo_master(12m ago)
```

## 功能

- **上下文窗口** — 实时使用百分比，颜色阈值（绿/黄/红）
- **Rate Limits** — 5 小时和 7 天用量，倒计时/重置时间
- **Git 分支** — 从 `.git/HEAD` 读取当前分支
- **活跃工具** — 正在运行和已完成的工具调用及次数
- **多会话监控** — 检测本机其他活跃的 Claude Code 会话
- **Token 用量** — 累计 input/output tokens
- **用量报告** — 生成带图表的 HTML 报告
- **显示预设** — full / essential / minimal 三种模式

## 快速开始

### 1. 安装 Bun

如果还没有安装 [Bun](https://bun.sh)：

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. 克隆并安装

```bash
git clone ssh://git@10.10.2.124:2222/junchi.ren/claude-hud.git
cd claude-hud
bun install
```

### 3. 配置 Claude Code

```bash
bun run src/index.ts setup
```

这会自动将 statusline 配置写入 `~/.claude/settings.json`。

### 4. 重启 Claude Code

关闭当前 Claude Code 会话，重新打开。底部应该出现 claude-hud 状态栏：

```
[Opus 4.6 (1M context)] │ Context ▰▱▱▱▱▱▱▱▱▱ 4% │ ⎇ main
Current ▰▰▱▱▱▱▱▱▱▱ 15% ↻3 hr 35 min │ All ▰▱▱▱▱▱▱▱▱▱ 5% ↻Thu 10:00 PM
```

### 5. 生成用量报告（可选）

```bash
bun run src/index.ts report
```

浏览器会自动打开一个带图表的 HTML 报告页面。

### 切换显示预设

如果信息太多或太少，可以切换预设：

```bash
# 创建配置文件
echo '{ "preset": "essential" }' > ~/.claude/claude-hud.json
```

可选值：`full`（默认，最全）、`essential`（中等）、`minimal`（最简）。

### 关闭 / 恢复原生

```bash
bun run src/index.ts disable
```

重启 Claude Code 后恢复原生状态栏。再次启用：`bun run src/index.ts enable`。

## 命令

| 命令 | 说明 |
|------|------|
| `claude-hud` | Statusline 模式（由 Claude Code 每 ~300ms 调用） |
| `claude-hud enable` | 启用 statusline（等同于 `setup`） |
| `claude-hud disable` | 关闭 statusline，恢复 Claude Code 原生状态栏 |
| `claude-hud setup` | 同 `enable` |
| `claude-hud report` | 生成 HTML 用量报告并打开浏览器 |
| `claude-hud report --no-open` | 仅生成报告不打开 |

## 用量报告

```bash
bun run src/index.ts report
```

生成 `~/.claude/claude-hud-report.html`，包含：
- 概览卡片（总会话数、总 tokens、活跃天数）
- 每日 Token 消耗堆叠柱状图
- 模型分布饼图（Opus/Sonnet/Haiku）
- 最近 100 个会话列表

## 预设

通过环境变量、配置文件或默认值设置：

```bash
# 环境变量
CLAUDE_HUD_PRESET=minimal

# 配置文件：~/.claude/claude-hud.json
{ "preset": "essential" }
```

| 元素 | full | essential | minimal |
|------|------|-----------|---------|
| 模型名称 | ✓ | ✓ | ✓ |
| Context 进度条 | ✓ | ✓ | ✓ |
| Git 分支 | ✓ | ✓ | ✓ |
| Rate Limits | ✓ | ✓ | |
| 活跃工具 | | | |
| Token 用量 | | ✓ | |
| 其他会话 | ✓ | ✓ | |

## 开发

```bash
bun test          # 运行 112 个测试
bun run build     # 构建 dist/claude-hud.js (~19KB)
```

## 许可证

MIT
