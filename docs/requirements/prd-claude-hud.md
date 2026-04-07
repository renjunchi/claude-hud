---
title: "claude-hud PRD"
doc_type: requirements
version: 1.1.0
status: draft
created: 2026-03-29
updated: 2026-03-29
authors:
  - 任俊驰
tags:
  - prd
  - requirements
  - claude-hud
---
# claude-hud PRD

> 产品需求文档 (Product Requirements Document)

## 1. 概述

### 1.1 背景

使用 Claude Code 进行开发时，存在以下痛点：

- **状态不可见**：无法实时了解 context window 占用、token 消耗、费用等关键信息
- **多会话管理困难**：并行运行多个 Claude Code 会话时，难以区分和管理各会话状态
- **效率监控缺失**：缺乏对 Claude Code 使用效率、成本和产出的追踪能力

### 1.2 目标

构建一个终端状态栏工具，基于 Claude Code statusline API，为开发者提供实时上下文监控和会话状态可视化能力。后续迭代扩展为 Web 仪表盘 + 费用追踪。

### 1.3 范围

#### 在范围内

- 终端实时状态栏（MVP，基于 statusline API）
- Token 用量统计和费用追踪（后续迭代，基于 API Proxy 或本地日志）
- Web 分析仪表盘（后续迭代）
- 多会话统一管理（后续迭代）

#### 明确排除

- Claude Code 功能扩展或替代
- 非 Claude Code 的 AI 工具监控
- 付费/商业化功能

---

## 2. 用户分析

### 2.1 目标用户

| 用户角色         | 描述                            | 核心诉求                                | 使用频率 |
| ---------------- | ------------------------------- | --------------------------------------- | -------- |
| 个人开发者       | 日常使用 Claude Code 的开发者   | 实时掌握 token 用量和费用，优化使用效率 | 每日     |
| 开发团队（后续） | 多人协作使用 Claude Code 的团队 | 统一监控团队 Claude Code 使用情况       | 每日     |

### 2.2 用户故事

#### US-001: 实时查看 Context Window 用量

- **作为** 个人开发者
- **我想要** 在终端状态栏实时看到当前会话的 context window 占用百分比
- **以便** 及时感知上下文即将耗尽并做出调整

**验收标准：**

- [ ] 状态栏显示 context window 占用百分比
- [ ] 用量 ≤70% 显示绿色，70%-90% 显示黄色，>90% 显示红色
- [ ] 更新延迟不超过 1 秒

#### US-002: 追踪 Token 消耗和费用（P1 — 后续迭代）

- **作为** 个人开发者
- **我想要** 看到当前会话的 token 消耗量和估算费用
- **以便** 控制使用成本

**验收标准：**

- [ ] 显示当前会话的输入/输出 token 数量
- [ ] 显示估算的 USD 费用
- [ ] 区分不同模型（Opus/Sonnet/Haiku）的消耗

> 注：MVP 不包含此功能，需要 API Proxy 或本地日志数据源支持

#### US-003: 监控 Agent 和任务状态

- **作为** 个人开发者
- **我想要** 看到当前运行的 agent 数量和任务进度
- **以便** 了解 Claude Code 当前的工作状态

**验收标准：**

- [ ] 显示活跃 agent 数量
- [ ] 显示当前任务名称或摘要
- [ ] agent 启动/结束时状态栏即时更新
- [ ] 无活跃 agent 时显示 idle 状态

#### US-004: 追踪活动工具使用

- **作为** 个人开发者
- **我想要** 看到 Claude Code 正在使用的工具（Read/Edit/Bash 等）
- **以便** 了解 Claude Code 当前具体在做什么

**验收标准：**

- [ ] 显示当前正在执行的工具名称
- [ ] 工具切换时状态栏即时更新
- [ ] 多工具并行执行时显示主要工具或数量（如 "Read +2"）
- [ ] 空闲时显示 idle 状态

#### US-005: 管理多个并行会话

- **作为** 个人开发者
- **我想要** 在一个视图中看到所有活跃 Claude Code 会话的状态
- **以便** 快速切换和管理多个并行任务

**验收标准：**

- [ ] 列出所有活跃会话及其基本状态
- [ ] 每个会话显示其工作目录和当前状态
- [ ] 支持按会话切换状态栏显示

#### US-006: 快速安装配置

- **作为** 个人开发者
- **我想要** 5 分钟内完成 claude-hud 的安装和配置
- **以便** 快速开始使用，无需复杂的环境搭建

**验收标准：**

- [ ] 通过一条命令完成安装（npm install / bun install）
- [ ] 提供 setup 命令自动配置 Claude Code settings.json
- [ ] 首次启动后状态栏立即显示数据
- [ ] 提供 README 文档说明完整安装流程

---

## 3. 功能需求

### 3.1 功能列表

| ID    | 功能名称            | 描述                                               | 优先级 | 关联用户故事   |
| ----- | ------------------- | -------------------------------------------------- | ------ | -------------- |
| F-001 | Context Window 监控 | 实时显示 context window 占用百分比，带颜色阈值     | P0     | US-001         |
| F-003 | Agent/任务状态显示  | 显示活跃 agent 数量和当前任务进度                  | P0     | US-003         |
| F-004 | 活动工具追踪        | 显示当前正在使用的工具名称                         | P0     | US-004         |
| F-006 | 终端状态栏渲染      | 通过 Claude Code statusline API 输出格式化状态信息 | P0     | US-001,003,004 |
| F-008 | 显示预设配置        | 支持 Full/Essential/Minimal 等显示预设             | P0     | US-001,003,004 |
| F-011 | 安装配置工具        | 提供 setup 命令自动配置 Claude Code statusline     | P0     | US-006         |
| F-002 | Token 用量统计      | 显示当前会话 input/output token 数和估算费用       | P1     | US-002         |
| F-005 | API 代理数据采集    | 通过代理 Anthropic API 请求采集用量数据            | P1     | US-002         |
| F-007 | 多会话管理          | 支持监控多个并行 Claude Code 会话                  | P1     | US-005         |
| F-009 | Web 仪表盘          | Web 页面展示历史数据、趋势分析                     | P2     | -              |
| F-010 | 团队视图            | 多人用量汇总和团队统计                             | P2     | -              |

> 优先级说明：P0=MVP 必须有, P1=首版后迭代, P2=未来考虑
>
> MVP 数据源：仅 Claude Code statusline API（stdin JSON → stdout），不含 API Proxy

### 3.2 功能详情

#### F-006: 终端状态栏渲染（MVP 核心）

**描述：** 利用 Claude Code 的 statusline API，解析 stdin JSON 数据并格式化为终端状态栏输出。

**MVP 数据流：**

```
Claude Code → stdin JSON → claude-hud 解析 → stdout formatted text → 终端状态栏
```

**输入：**

- Claude Code 通过 stdin 传入的 JSON 状态数据（参见下方 Statusline API 规格）

**输出：**

- stdout 输出格式化的状态栏文本

**业务规则：**

1. 更新频率 ~300ms
2. 支持颜色编码（ANSI/终端兼容）
3. 状态栏宽度自适应终端宽度

#### Statusline API 输入规格（已验证）

**说明：** Claude Code statusline API 通过 stdin 向 statusline 程序发送 JSON 数据，程序处理后将格式化文本输出到 stdout。每次调用为独立进程，无持久状态。

**stdin JSON 结构：**

```json
{
  "transcript_path": "~/.claude/projects/.../transcript.jsonl",
  "cwd": "/path/to/project",
  "model": {
    "id": "claude-opus-4-6-20250805",
    "display_name": "Opus"
  },
  "context_window": {
    "context_window_size": 200000,
    "current_usage": {
      "input_tokens": 45000,
      "output_tokens": 3000,
      "cache_creation_input_tokens": 10000,
      "cache_read_input_tokens": 5000
    },
    "used_percentage": 45,
    "remaining_percentage": 55
  },
  "rate_limits": {
    "five_hour": {
      "used_percentage": 25,
      "resets_at": 1720000000
    },
    "seven_day": {
      "used_percentage": 10,
      "resets_at": 1720500000
    }
  }
}
```

**关键说明：**

- `used_percentage` / `remaining_percentage` 为 v2.1.6+ 原生字段，优先使用
- `rate_limits` 可能为 null（未开启 API 用量追踪时）
- **Agent/Tool 数据不在 stdin 中**：需通过 `transcript_path` 读取 JSONL 文件解析
- Transcript JSONL 中包含 `tool_use` 类型的 content block（工具调用）和 `custom` 类型的 block（agent 信息）

**配置方式：** 在 `~/.claude/settings.json` 中设置：

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-hud"
  }
}
```

#### F-005: API 代理数据采集（P1 — 后续迭代）

**描述：** 在本地部署一个 API 代理层，拦截 Claude Code 发往 Anthropic API 的请求，从中提取 token 用量、模型信息等数据。

**输入：**

- Claude Code 发出的 Anthropic API 请求
- API 响应中的 usage 字段

**输出：**

- 结构化的用量数据（token 数、模型、时间戳）
- 持久化的历史记录

**业务规则：**

1. 代理层对 Claude Code 透明，不影响正常功能
2. 不存储 API key 和对话内容，仅采集元数据
3. 所有数据仅存储在本地

**异常处理：**

- 代理层崩溃 → Claude Code 直连 API（降级策略）
- API 响应格式变化 → 记录原始数据，降级显示

> 注：此功能为 P1，MVP 阶段不实现

---

## 4. 非功能需求

### 4.1 性能需求

| 指标             | 要求    | 说明                 | 阶段 |
| ---------------- | ------- | -------------------- | ---- |
| 状态栏更新延迟   | < 300ms | 从数据变更到显示更新 | MVP  |
| 内存占用         | < 50MB  | 常驻内存开销         | MVP  |
| API 代理额外延迟 | < 50ms  | 代理层引入的额外延迟 | P1   |

### 4.2 安全需求

- [ ] 不存储 API key（仅透传）
- [ ] 不存储对话内容（仅采集 usage 元数据）
- [ ] 所有数据本地存储，不上传外部服务

### 4.3 兼容性需求

- **运行环境：** macOS, Linux
- **Claude Code 版本：** v1.0.80+
- **运行时：** Node.js 18+ 或 Bun
- **终端：** 支持 ANSI 颜色的终端模拟器

---

## 5. 约束条件

### 5.1 技术约束

- MVP 仅依赖 Claude Code statusline API（stdin JSON → stdout 格式）
- API 代理需兼容 Anthropic Messages API 格式（P1 阶段）
- 数据采集不能影响 Claude Code 正常工作

### 5.2 业务约束

- 个人开源项目，无商业约束
- 参考 ccusage 的设计思路

---

## 6. 成功指标

### 6.1 量化指标

| 指标             | 当前值      | 目标值                                 | 衡量方式 | 阶段 |
| ---------------- | ----------- | -------------------------------------- | -------- | ---- |
| 状态栏信息可见性 | 0（无工具） | 3 类信息实时可见（context/agent/tool） | 功能验收 | MVP  |
| 安装配置时间     | -           | < 5 分钟                               | 用户测试 | MVP  |
| API 代理额外延迟 | -           | < 50ms                                 | 性能测试 | P1   |

### 6.2 定性指标

- [ ] 开发者日常使用时能实时感知 Claude Code 状态
- [ ] 安装配置过程简单（5 分钟内完成）

---

## 7. 里程碑

| 里程碑                       | 交付物                            | 说明                       |
| ---------------------------- | --------------------------------- | -------------------------- |
| M1: MVP - 终端状态栏         | 状态栏渲染 + 显示预设 + 安装工具  | P0 功能，仅 statusline API |
| M2: 增强 - 费用追踪 + 多会话 | Token 统计、API Proxy、多会话管理 | P1 功能                    |
| M3: Web 仪表盘               | Web 页面 + 历史分析 + 团队视图    | P2 功能                    |

---

## 8. 依赖与风险

### 8.1 依赖项

| 依赖                        | 类型 | 说明                      |
| --------------------------- | ---- | ------------------------- |
| Claude Code statusline API  | 技术 | 核心集成接口，需 v1.0.80+ |
| Anthropic Messages API 格式 | 技术 | API 代理需解析的目标格式  |

### 8.2 风险评估

| 风险                                | 可能性 | 影响 | 缓解措施                           | 阶段 |
| ----------------------------------- | ------ | ---- | ---------------------------------- | ---- |
| Transcript JSONL 解析复杂度高       | 中     | 中   | 使用缓存机制优化性能               | MVP  |
| Claude Code statusline API 格式变更 | 中     | 高   | 关注官方更新，做好版本兼容         | MVP  |
| API 代理影响 Claude Code 稳定性     | 低     | 高   | 实现降级策略，代理崩溃不影响主功能 | P1   |
| Anthropic API 响应格式变化          | 低     | 中   | 解析时容错处理                     | P1   |

---

## 9. 附录

### 9.1 术语表

| 术语           | 定义                                                         |
| -------------- | ------------------------------------------------------------ |
| Context Window | Claude 模型的上下文窗口，限制单次会话可处理的 token 总量     |
| Statusline API | Claude Code 提供的终端状态栏集成接口（stdin JSON → stdout） |
| API Proxy      | 本地代理层，拦截并透传 Anthropic API 请求以采集元数据        |

### 9.2 参考资料

- [ccusage](https://github.com/ryoppippi/ccusage) - Claude Code 用量统计 CLI 工具，读取本地 JSONL 日志

---

## 变更历史

| 版本  | 日期       | 作者   | 变更内容                                                                                                                                                                 |
| ----- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0.0 | 2026-03-29 | 任俊驰 | 初始版本                                                                                                                                                                 |
| 1.1.0 | 2026-03-29 | 任俊驰 | MVP 精简：移除 API Proxy 和 Token 统计（降为 P1），新增 statusline API 规格说明、安装配置用户故事(US-006)和功能(F-011)，提升显示预设(F-008)为 P0，细化验收标准和风险评估 |
