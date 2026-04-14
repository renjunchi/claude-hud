---
title: "cli-hud 技术架构"
doc_type: design
version: 2.0.0
status: active
created: 2026-03-29
updated: 2026-03-29
authors:
  - 任俊驰
tags:
  - architecture
  - design
  - cli-hud
---

# cli-hud 技术架构

## 1. 数据流

### 2.1 Statusline（实时，~300ms 刷新）

```
┌─────────────────────────────────────────┐
│              Claude Code                │
│  (每 ~300ms 调用一次 cli-hud)          │
└──────────────┬──────────────────────────┘
               │ stdin: JSON
               ▼
┌──────────────────────────┐
│         index.ts         │
│  1. readStdin()          │
│  2. parseTranscript()    │
│  3. getGitBranch()       │
│  4. scanActiveSessions() │
│  5. render()             │
│  6. console.log → stdout │
└──┬───────┬───────┬───────┘
   │       │       │
   ▼       ▼       ▼
stdin.ts  transcript.ts  render/index.ts
 context%   tools/agents   预设渲染
 model      token usage    格式化输出
 rate limits 缓存机制
```

### 2.2 Report（离线，按需生成）

```
cli-hud report
       │
       ▼
┌──────────────────────────┐
│   report/aggregate.ts    │
│  扫描 ~/.claude/projects │
│  所有 JSONL 文件          │
│  聚合 token/会话数据       │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│     report/html.ts       │
│  生成自包含 HTML 报告     │
│  Chart.js CDN 图表       │
│  暗色主题                │
└──────────┬───────────────┘
           ▼
~/.claude/cli-hud-report.html → 浏览器打开
```

每次 statusline 调用为独立进程，无持久状态。唯一的"状态"是 transcript 缓存文件。

## 2. 模块结构

```
src/
  index.ts              # 入口：CLI 路由（statusline / setup / report）
  types.ts              # 所有类型定义
  stdin.ts              # stdin JSON 解析，context%、model、rate limits、git branch
  transcript.ts         # Transcript JSONL 解析（tools/agents/token usage），mtime 缓存
  presets.ts            # 三种显示预设定义
  sessions.ts           # 多会话扫描（history.jsonl）
  render/
    index.ts            # 主渲染器：按预设组装输出行
    context-bar.ts      # Session 行 + Rate Limits 行（▰▱ 进度条）
    tools.ts            # 活跃/完成的工具显示
    agents.ts           # 运行中/完成的 agent 显示
    token-usage.ts      # Token 用量格式化
    sessions.ts         # 其他活跃会话显示
    colors.ts           # ANSI 颜色工具函数
  cli/
    setup.ts            # `cli-hud setup` 命令
    report.ts           # `cli-hud report` 命令
  report/
    aggregate.ts        # 历史数据聚合（按天/按会话/按模型）
    html.ts             # HTML 报告模板生成
```

## 3. 核心类型定义

```typescript
/** stdin JSON（Claude Code 发送） */
interface StdinData {
  transcript_path?: string;
  cwd?: string;
  model?: { id?: string; display_name?: string };
  context_window?: {
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
    used_percentage?: number | null;
    remaining_percentage?: number | null;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null } | null;
    seven_day?: { used_percentage?: number | null; resets_at?: number | null } | null;
  } | null;
}

interface TokenUsage {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  model: string;
}

interface TranscriptData {
  tools: ToolEntry[];
  agents: AgentEntry[];
  usage: TokenUsage;
}

type Preset = 'full' | 'essential' | 'minimal';

interface PresetConfig {
  showModel: boolean;
  showContextBar: boolean;
  showProject: boolean;
  showRateLimits: boolean;
  showTools: boolean;
  showAgents: boolean;
  showTokenUsage: boolean;
  showSessions: boolean;
}
```

## 4. 显示预设

| 元素 | full | essential | minimal |
|------|------|-----------|---------|
| 模型名称 | Y | Y | Y |
| Context 进度条 | Y | Y | Y |
| 项目路径 | N | Y | N |
| Rate Limits | Y | Y | N |
| 活跃工具 | Y | N | N |
| Agent 状态 | N | N | N |
| Token 用量 | N | Y | N |
| 其他会话 | Y | Y | N |
| Git 分支 | Y | Y | Y |

预设选择优先级：
1. 环境变量 `CLAUDE_HUD_PRESET=minimal`
2. 配置文件 `~/.claude/cli-hud.json` → `{ "preset": "essential" }`
3. 默认值：`full`

## 5. 显示效果

**full（当前默认）**:
```
[Opus 4.6 (1M context)] │ Context ▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱ 15% │ ⎇ main
Current ▰▰▰▱▱▱▱▱▱▱ 32% ↻2 hr 35 min │ All ▰▰▰▰▱▱▱▱▱▱ 43% ↻Thu 10:00 PM
◐ Read │ ✓ Grep x5 │ ✓ Edit x2
+2 sessions: n8n-plugin(5m ago) servo_master(12m ago)
```

**essential**:
```
[Opus 4.6 (1M context)] │ my-project │ Context ▰▰▱▱▱▱▱▱▱▱ 15% │ ⎇ main
Current ▰▰▰▱▱▱▱▱▱▱ 32% ↻2 hr 35 min │ All ▰▰▰▰▱▱▱▱▱▱ 43% ↻Thu 10:00 PM
↓12.3K ↑1.2K │ $0.21
+1 session: n8n-plugin(5m ago)
```

**minimal**:
```
[Opus 4.6 (1M context)] │ Context ▰▰▱▱▱▱▱▱▱▱ 15% │ ⎇ main
```

颜色阈值：
- context ≤70%: 绿色
- 70%-90%: 黄色
- \>90%: 红色

## 6. Transcript 缓存策略

Transcript JSONL 文件在会话期间持续增长，每次调用都需要解析。采用 mtime + size 的缓存机制：

1. `stat()` transcript 文件获取 `mtimeMs` 和 `size`
2. 缓存文件路径：`~/.claude/cli-hud-cache/<path-hash>.json`
3. 若缓存存在且 `(mtimeMs, size)` 匹配且包含 `usage` 字段，直接返回缓存数据
4. 否则用 `Bun.file().text()` + `split('\n')` 全量解析
5. 写入缓存（写入失败不影响主流程）

## 7. CLI 命令

| 命令 | 说明 |
|------|------|
| `cli-hud` | Statusline 模式（stdin → stdout，由 Claude Code 调用） |
| `cli-hud setup` | 自动配置 Claude Code 的 statusline 设置 |
| `cli-hud report` | 生成 HTML 用量报告并打开浏览器 |
| `cli-hud report --no-open` | 仅生成报告不打开 |

## 8. HTML 报告

`cli-hud report` 扫描 `~/.claude/projects/` 下所有 transcript JSONL，生成自包含 HTML：

- **概览卡片**：总会话数、总 token、活跃天数
- **Token 趋势**：每日 input/output 堆叠柱状图（Chart.js）
- **模型分布**：Opus/Sonnet/Haiku 使用占比饼图
- **会话列表**：最近 100 个会话详情表

输出路径：`~/.claude/cli-hud-report.html`

## 9. 构建和分发

```json
{
  "name": "cli-hud",
  "version": "0.1.0",
  "type": "module",
  "bin": { "cli-hud": "dist/cli-hud.js" },
  "scripts": {
    "build": "bun build src/index.ts --outfile dist/cli-hud.js --target bun --minify",
    "test": "bun test"
  }
}
```

产物：`dist/cli-hud.js`（~19KB，minified，17 模块打包）

## 10. 测试

123 个测试覆盖 14 个测试文件：

| 测试文件 | 覆盖模块 |
|---------|---------|
| stdin.test.ts | context%、model、rate limits、时间格式化、git branch |
| transcript.test.ts | JSONL 解析、tool/agent 提取、token 累计、容错 |
| sessions.test.ts | 项目名提取、sessionId 提取、时间格式化 |
| presets.test.ts | 预设常量验证 |
| render/colors.test.ts | ANSI 颜色、阈值、stripAnsi |
| render/context-bar.test.ts | Session 行、Rate Limits 行 |
| render/tools.test.ts | 工具分组、计数、排序 |
| render/agents.test.ts | Agent 状态、单复数 |
| render/token-usage.test.ts | Token 格式化 |
| render/sessions.test.ts | 会话行渲染 |
| render/index.test.ts | 预设组合渲染 |
| report/aggregate.test.ts | 数据聚合 |
| report/html.test.ts | HTML 生成验证 |

## 11. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun | 启动快，300ms 调用间隔下关键 |
| 配置方式 | 3 个预设 | 简单，易维护 |
| Token 数据源 | Transcript JSONL | 零侵入，无需 API 代理 |
| 多会话检测 | history.jsonl | 高效，无需扫描全部 transcript |
| 报告方案 | 静态 HTML + Chart.js CDN | 零前端依赖，自包含 |
| Git 分支 | 读取 .git/HEAD | 无需 git 命令，纯文件 I/O |
| 跨平台 | open / xdg-open / start | macOS / Linux / Windows |
