# cli-hud

[Claude Code](https://claude.ai/code) 终端状态栏 HUD。实时显示上下文窗口、Rate Limits、活跃工具和多会话监控。

```
[Opus 4.6 (1M context)] │ Context ▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱ 15% │ ⎇ main
Current ▰▰▰▱▱▱▱▱▱▱ 32% ↻2 hr 35 min │ All ▰▰▰▰▱▱▱▱▱▱ 43% ↻Thu 10:00 PM
◐ Read │ ✓ Grep x5 │ ✓ Edit x2
+2 sessions: n8n-plugin(5m ago) servo_master(12m ago)
```

## 功能

- **上下文窗口** — 实时使用百分比，颜色阈值（绿/黄/红）；≥90% 时追加 `↯` 提示自动压缩临近
- **Plan Mode 指示** — 进入计划模式时模型名后显示黄色 `[PLAN]`
- **Rate Limits** — 5 小时和 7 天用量，倒计时/重置时间
- **Git 分支 + Worktree** — 从 `.git/HEAD` 读取当前分支；在 worktree 中追加 `[wt]` 标记
- **活跃工具** — 运行中工具显示 Braille 旋转帧 + 输入摘要，已完成工具按次数聚合
  - **Skill 名称展示** — `Skill: ad-2-auto-issue` 而非泛 `Skill`
  - **MCP 工具压缩** — `mcp__claude-in-chrome__tabs_create_mcp` → `chrome:tabs_create`
- **后台任务** — `run_in_background:true` 的 Bash / Agent 独立成行 `bg: ⠋ Bash: …`
- **任务进度** — TaskCreate / TaskUpdate 派生 `Tasks ✓2/5 ↻1`
- **多会话监控** — 检测本机其他活跃的 Claude Code 会话，可选状态提示行（长任务完成 / 出错）+ 终端铃声
- **Token 用量 / 输出速度** — 累计 input/output tokens，可选实时输出速度
- **用量报告** — 生成带图表的 HTML 报告
- **显示预设** — `full` / `essential` / `minimal` + 完全自定义

## 快速开始

### 1. 安装 Bun

如果还没有安装 [Bun](https://bun.sh)：

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. 安装插件（推荐）

在 Claude Code 中直接执行：

```
/plugin marketplace add renjunchi/claude-hud
/plugin install cli-hud@cli-hud
```

第一行把本仓库注册为名为 `cli-hud` 的 marketplace（拉取根目录的 `.claude-plugin/marketplace.json`）；第二行的 `cli-hud@cli-hud` 表示「从 marketplace `cli-hud` 安装插件 `cli-hud`」（格式为 `<plugin>@<marketplace>`）。

升级 / 卸载也走原生命令：

```
/plugin update cli-hud@cli-hud
/plugin uninstall cli-hud@cli-hud
```

### 3. 重启 Claude Code

关闭当前 Claude Code 会话，重新打开。底部应该出现 cli-hud 状态栏：

```
[Opus 4.6 (1M context)] │ Context ▰▱▱▱▱▱▱▱▱▱ 4% │ ⎇ main
Current ▰▰▱▱▱▱▱▱▱▱ 15% ↻3 hr 35 min │ All ▰▱▱▱▱▱▱▱▱▱ 5% ↻Thu 10:00 PM
```

### 4. 生成用量报告（可选）

在 Claude Code 中输入 `/cli-hud:report`（或命令行 `bun run src/index.ts report`），会生成 `~/.claude/cli-hud-report.html` 并自动打开浏览器，包含：

- 概览卡片（总会话数、总 tokens、活跃天数）
- 每日 Token 消耗堆叠柱状图
- 模型分布饼图（Opus / Sonnet / Haiku）
- 最近 100 个会话列表

显示元素如不合用，见下方[配置](#配置)章节调整 preset 或自定义 `show` 字段。

### 关闭 / 恢复原生

在 Claude Code 中输入 `/cli-hud:disable`，或通过命令行：

```bash
bun run src/index.ts disable
```

重启 Claude Code 后恢复原生状态栏。再次启用：`/cli-hud:enable` 或 `bun run src/index.ts enable`。

## 命令

### 斜杠命令（Claude Code 内使用）

| 命令 | 说明 |
|------|------|
| `/cli-hud:enable` | 启用 statusline |
| `/cli-hud:disable` | 关闭 statusline，恢复原生状态栏 |
| `/cli-hud:report` | 生成 HTML 用量报告并打开浏览器 |

### CLI 命令

| 命令 | 说明 |
|------|------|
| `cli-hud` | Statusline 模式（由 Claude Code 每 ~300ms 调用，stdin 读 JSON） |
| `cli-hud enable` / `cli-hud setup` | 启用 statusline，写入 `~/.claude/settings.json` |
| `cli-hud disable` | 关闭 statusline，恢复 Claude Code 原生状态栏 |
| `cli-hud report [--no-open]` | 生成 HTML 用量报告，默认自动打开浏览器 |
| `cli-hud watch start\|stop\|status` | 管理后台 watcher（跨会话扫描与铃声） |

## 配置

配置文件：`~/.claude/cli-hud.json`（缺省时使用 `full` 预设）。

```bash
# 选预设
echo '{ "preset": "essential" }' > ~/.claude/cli-hud.json

# 在预设上覆盖个别开关
echo '{ "preset": "full", "show": { "sessions": false } }' > ~/.claude/cli-hud.json

# 完全自定义：custom 空白基底，未列出的元素一律不显示
echo '{ "preset": "custom", "show": { "model": true, "contextBar": true, "rateLimits": true } }' > ~/.claude/cli-hud.json
```

也可以用环境变量临时切换预设：

```bash
CLAUDE_HUD_PRESET=minimal
```

**解析顺序**（见 `src/presets.ts`）：

1. 选定**基础预设** —— `CLAUDE_HUD_PRESET` 环境变量 > 配置文件 `preset` 字段 > 默认 `full`
2. 应用 `show` **覆盖** —— 配置文件中 `show` 字段的每个键独立覆盖基础预设对应开关

特殊值：`preset: "custom"` 表示空白基础（所有开关默认 false），仅显示 `show` 中显式置 `true` 的元素。注意：不设 `preset` 而仅给 `show` 时，基础是 `full`（未列出的元素按 `full` 默认显示），与 `custom` **并不等价**。

### 内置预设对照

| `show` 键 | 对应元素 | full | essential | minimal |
|-----------|---------|:----:|:---------:|:-------:|
| `model` | 模型名称 | ✓ | ✓ | ✓ |
| `contextBar` | Context 进度条 | ✓ | ✓ | ✓ |
| `project` | 项目名称 |  | ✓ |  |
| `rateLimits` | Rate Limits | ✓ | ✓ |  |
| `tools` | 活跃工具（前台） | ✓ | ✓ |  |
| `background` | 后台 Bash / Agent（`run_in_background:true`） | ✓ | ✓ |  |
| `tasks` | TaskCreate 任务进度 `Tasks ✓2/5 ↻1` | ✓ | ✓ |  |
| `agents` | Agent 状态 |  |  |  |
| `tokenUsage` | Token 用量 |  | ✓ |  |
| `sessions` | 其他会话 | ✓ | ✓ |  |
| `speed` | 输出速度 | ✓ | ✓ |  |
| `notifications` | 跨会话状态行（✓ 长任务完成 / ✗ 出错）+ 铃声 | ✓ | ✓ |  |

> `notifications` 开关同时控制是否启动后台 watcher daemon —— 关掉它就不会有 `cli-hud watch --daemon` 子进程被自动拉起。

> Git 分支不受 `show` 控制，只要识别到 `.git/HEAD` 就显示。`agents` 默认所有预设关闭，需要时显式 `"show": { "agents": true }` 启用。

## 开发

```bash
bun test          # 运行测试（~1s，213 用例）
bun run test:perf # statusline 主路径性能护栏（重构 transcript/sessions 等热路径后必跑）
bun run build     # 构建 dist/cli-hud.js
```

### 本地开发安装（developer mode）

`install.sh` 把 Claude Code 的插件缓存目录 `symlink` 到当前 checkout，注册为 directory marketplace（`cli-hud@cli-hud-local`）：

```bash
bash install.sh   # symlink 缓存 + 注册 marketplace + 启用 statusline
bash uninstall.sh # 反注册并恢复原生 statusline
```

由于是 symlink，`src/` 改动**即时生效**（下一次 ~300ms statusline tick 就用新代码），无需重跑 `install.sh`；只在 `.claude-plugin/plugin.json` 的版本号变更后才需要再装一次（version 是缓存路径的一部分）。

该路径只在本仓库目录下使用；普通用户应走上面的 `/plugin marketplace` 安装。

## 许可证

MIT
