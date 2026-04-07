---
title: "自定义预设配置 PRD"
doc_type: requirements
version: 1.0.0
status: draft
created: 2026-04-07
updated: 2026-04-07
authors:
  - 任俊驰
tags:
  - prd
  - requirements
  - configuration
  - preset
---

# 自定义预设配置 PRD

> 产品需求文档 (Product Requirements Document)

## 1. 概述

### 1.1 背景

claude-hud 当前仅支持 3 个硬编码预设（`full` / `essential` / `minimal`），每个预设是 8 个布尔开关的固定组合。用户无法自定义显示哪些状态栏元素——例如只想看 model + context + rateLimits，但不需要 sessions 和 tokenUsage，就没有任何预设能满足。

**现状约束：**

- `PresetConfig` 接口已定义 8 个布尔字段（`showModel`, `showContextBar`, `showProject`, `showRateLimits`, `showTools`, `showAgents`, `showTokenUsage`, `showSessions`）
- 配置文件 `~/.claude/claude-hud.json` 已存在，当前仅支持 `{ "preset": "full" | "essential" | "minimal" }`
- 渲染层已是模块化设计，每行独立渲染、按 preset 开关条件显示

### 1.2 目标

允许用户通过配置文件自定义状态栏元素开关组合，在保持现有 3 个内置预设不变的前提下，新增 `custom` 预设支持用户级配置覆盖。

### 1.3 范围

#### 在范围内

- 支持在 `claude-hud.json` 中自定义元素开关组合
- 保持 `full` / `essential` / `minimal` 三个内置预设向后兼容
- 支持基于内置预设的部分覆盖（如：基于 `full`，仅关闭 `sessions`）

#### 明确排除

- 样式参数配置（进度条宽度、颜色阈值、时间格式等）
- 自定义模板字符串 / 布局引擎
- 多配置文件 / 项目级配置
- GUI 配置界面

---

## 2. 用户分析

### 2.1 目标用户

| 用户角色 | 描述 | 核心诉求 | 使用频率 |
|---------|------|---------|---------|
| Claude Code 重度用户 | 每日使用 Claude Code，对终端空间敏感 | 精确控制状态栏显示哪些信息 | 一次配置，长期使用 |

### 2.2 用户故事

#### US-007: 自定义状态栏显示元素

- **作为** Claude Code 重度用户
- **我想要** 在配置文件中自由组合状态栏显示哪些元素
- **以便** 只看到对我有用的信息，减少视觉噪音

**验收标准：**

- [ ] 用户可在 `~/.claude/claude-hud.json` 中通过 `show` 字段自定义元素开关
- [ ] 未设置 `show` 字段时，行为与现有逻辑完全一致（向后兼容）
- [ ] 所有 8 个现有元素均可独立开关

#### US-008: 基于内置预设部分覆盖

- **作为** Claude Code 重度用户
- **我想要** 选择一个内置预设作为基础，只覆盖个别开关
- **以便** 不需要从零配置所有开关

**验收标准：**

- [ ] 支持 `"preset": "full"` + `"show": { "sessions": false }` 的组合写法
- [ ] `show` 中未指定的字段继承基础预设的值
- [ ] `"preset": "custom"` 时，`show` 未指定的字段默认为 `false`

---

## 3. 功能需求

### 3.1 功能列表

| ID | 功能名称 | 描述 | 优先级 | 关联用户故事 |
|----|---------|------|--------|-------------|
| F-012 | 自定义元素开关 | 在 claude-hud.json 中通过 `show` 字段自定义各元素的显示/隐藏 | P0 | US-007 |
| F-013 | 预设继承覆盖 | 支持基于内置预设部分覆盖，`show` 字段与 `preset` 字段合并 | P0 | US-008 |
| F-014 | 配置校验 | 对无效的 `show` 字段键名给出警告（stderr），不中断渲染 | P1 | US-007 |

### 3.2 配置格式

#### 场景 A：纯预设（现有行为，不变）

```json
{
  "preset": "full"
}
```

#### 场景 B：预设 + 部分覆盖

```json
{
  "preset": "full",
  "show": {
    "sessions": false
  }
}
```

逻辑：以 `full` 预设为基础，`show` 中的字段覆盖对应值，未指定字段保持预设默认值。

#### 场景 C：完全自定义

```json
{
  "preset": "custom",
  "show": {
    "model": true,
    "contextBar": true,
    "rateLimits": true
  }
}
```

逻辑：`preset` 为 `custom` 时，基础全部为 `false`，仅 `show` 中设为 `true` 的元素显示。

#### 场景 D：仅 show，无 preset

```json
{
  "show": {
    "model": true,
    "contextBar": true
  }
}
```

逻辑：等同于 `"preset": "custom"`，基础全部为 `false`，仅 `show` 中设为 `true` 的元素显示。

### 3.3 配置合并优先级

```
环境变量 CLAUDE_HUD_PRESET  >  配置文件 show 字段  >  配置文件 preset 字段  >  默认 "full"
```

**注意：** 当环境变量指定了预设时，配置文件的 `show` 字段仍然生效（在环境变量指定的预设基础上覆盖）。

### 3.4 show 字段键名映射

| 配置键 | 对应 PresetConfig 字段 |
|--------|----------------------|
| `model` | `showModel` |
| `contextBar` | `showContextBar` |
| `project` | `showProject` |
| `rateLimits` | `showRateLimits` |
| `tools` | `showTools` |
| `agents` | `showAgents` |
| `tokenUsage` | `showTokenUsage` |
| `sessions` | `showSessions` |

---

## 4. 非功能需求

| 指标 | 要求 | 说明 |
|------|------|------|
| 配置解析耗时 | < 5ms | 不影响 300ms 渲染周期 |
| 向后兼容 | 100% | 无 `show` 字段时行为完全不变 |
| 错误容忍 | 配置解析失败时降级为默认预设 | 不中断渲染 |

---

## 5. 约束条件

### 5.1 技术约束

- 配置文件格式保持 JSON（不引入 YAML/TOML）
- 不新增运行时依赖
- `PresetConfig` 接口保持不变，扩展通过配置解析层实现

### 5.2 影响范围

| 文件 | 变更类型 |
|------|---------|
| `src/types.ts` | 新增 `HudConfig` 接口、扩展 `Preset` 类型 |
| `src/presets.ts` | 重构 `resolvePresetName` → `resolvePresetConfig`，实现配置合并逻辑 |
| `src/render/index.ts` | 适配新的配置解析入口 |
| `src/index.ts` | 调用新解析函数 |
| `README.md` | 补充自定义配置文档 |

---

## 6. 成功指标

| 指标 | 目标值 | 衡量方式 |
|------|--------|---------|
| 配置组合覆盖 | 2^8 = 256 种组合均可表达 | 单元测试 |
| 向后兼容 | 现有 3 个预设行为不变 | 回归测试 |
| 零配置可用 | 无配置文件时默认行为不变 | 集成测试 |

---

## 7. 里程碑

本需求作为 F-008（显示预设配置）的增强，归入现有 M1 里程碑。

| 阶段 | 交付物 |
|------|--------|
| 实现 | 配置解析 + 合并逻辑 + 单元测试 |
| 文档 | README 配置说明更新 |

---

## 8. 依赖与风险

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 配置文件 JSON 语法错误导致状态栏消失 | 中 | 高 | 解析失败时降级为默认预设，stderr 输出警告 |
| 未来新增元素需同步更新 show 键名 | 低 | 低 | 新元素默认 false（custom 模式）或跟随预设 |

---

## 变更历史

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|---------|
| 1.0.0 | 2026-04-07 | 任俊驰 | 初始版本 |
