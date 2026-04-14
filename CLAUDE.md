# cli-hud 开发指南

> 本文档为 Claude Code 等 AI Agent 在本项目中工作的最小指南，保持简洁可执行。

## 核心口径（必须遵守）

- **项目名称**：cli-hud
- **技术栈**：待补充（初始化时未检测到标准项目类型文件）
- **术语定义**：统一参考 [项目术语表](./docs/design/glossary.md)（如果有）

## 工作方式（对 AI 的直接约束）

- 仅在确认需求后修改文件，避免大范围重构
- 出现冲突口径时，以本文档为准

## 上下文管理

1. **搜索任务**：使用 Task tool (Explore agent) 而非直接 Grep/Glob
2. **多步骤分析**：使用 subagent 处理，只返回精简结果
3. **并行任务**：2+ 个独立任务时使用并行 agent

## 快速参考

| 场景 | 参考文档 |
|------|---------|
| **Git 操作** | [Git 安全规范](#git-安全规范ai-必须遵守)（本文档） |

## Git 安全规范（AI 必须遵守）

### 基本原则
1. **提交需明确授权**：不自动执行 `git commit`
2. **推送需二次确认**：不自动执行 `git push`
3. **破坏性操作需警告**：删除文件前必须确认

### 危险操作保护
| 危险命令 | 风险 | 安全替代 |
|---------|------|---------|
| `git reset --hard origin/xxx` | 丢弃本地未推送的提交 | 先 `git log origin/xxx..HEAD` 检查 |
| `git clean -fd` | 删除未跟踪文件 | 先 `git clean -nd` 预览 |
| `git push --force` | 覆盖远程历史 | 使用 `--force-with-lease` |

## 文档结构

- `docs/requirements/`：需求文档（Phase 0）
- `docs/reference/`：参考方案（Phase 0）
- `docs/planning/`：规划文档
- `docs/design/`：技术设计文档
- `docs/rules/`：治理规范
- `docs/guides/`：使用指南
- `docs/history/`：变更历史归档
- `docs/research/`：研究文档

## 相关文档

- [README.md](./README.md) - 项目简介

## 变更历史

### v1.0.0 (2026-03-29)
- 由 ad-init 初始化生成
