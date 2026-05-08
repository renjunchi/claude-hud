<!-- This file is rendered. Edit .agentic/project-guide.md for shared rules. -->
<!-- host-target: AGENTS.md -->
<!-- canonical-source: .agentic/project-guide.md -->
<!-- ad:project-guide:rendered:start -->
# cli-hud 开发指南

> 本文档为 Claude Code 等 AI Agent 在本项目中工作的最小指南，保持简洁可执行。

## 核心口径（必须遵守）

- **项目名称**：cli-hud
- **技术栈**：Node.js / TypeScript（Bun runtime；`bun test` / `bun build`）
- **术语定义**：统一参考 [项目术语表](./docs/design/glossary.md)（如果有）

## 工作方式（对 AI 的直接约束）

- 仅在确认需求后修改文件，避免大范围重构
- 出现冲突口径时，以本文档为准
- **TDD 优先**：本项目 Test Profile 4/5 ⭐（`bun test` ~1s，14 测试文件 / 175 用例），改动 `src/` 时先写或更新对应 `*.test.ts`，再实现；提交前必须 `bun test` 全绿
- 文件命名约定：每个 `src/foo.ts` 都有配对的 `src/foo.test.ts`；新增模块同步新增测试

## 项目约束（cli-hud 特有）

- **Runtime 锁定 Bun**：不要引入 Node.js-only API（如 `fs/promises` 之外的 Node-specific 模块）；测试用 `bun:test` 而非 jest/vitest
- **性能敏感路径**：`src/index.ts` → `render/` 是 statusline 主路径，Claude Code **每 ~300ms 调用一次**。改动这条路径时避免：阻塞 I/O、重 JSON parse、跨进程 spawn。重活放到 `src/cli/watch.ts` 后台 watcher
- **构建产物**：`bun build src/index.ts --outfile dist/cli-hud.js --target bun --minify`，当前体积 ~37KB / 19 模块；新增依赖前评估对体积影响
- **TypeScript strict**：`tsconfig.json` 已开 `strict: true`，禁止用 `any` 绕过类型；`@types/bun` 提供 Bun 类型
- **配置文件**：用户配置在 `~/.claude/cli-hud.json`（preset / show 字段），优先级见 `src/presets.ts`
- **安装路径**：`~/.claude/plugins/cli-hud`（生产）；本仓库为开发源

## 上下文管理

1. **搜索任务**：使用 Task tool (Explore agent) 而非直接 Grep/Glob
2. **多步骤分析**：使用 subagent 处理，只返回精简结果
3. **并行任务**：2+ 个独立任务时使用并行 agent

## 快速参考

| 场景 | 参考文档 / 命令 |
|------|---------|
| **Git 操作** | [Git 安全规范](#git-安全规范ai-必须遵守)（本文档） |
| **运行测试** | `bun test`（全量 ~1s）／ `bun test src/render/tools.test.ts`（单文件） |
| **本地开发** | `bun run dev`（直接跑 `src/index.ts`） |
| **构建** | `bun run build` → `dist/cli-hud.js` |
| **架构总览** | [docs/design/architecture.md](./docs/design/architecture.md) |
| **README（用户视角）** | [README.md](./README.md) |

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

### v1.2.0 (2026-04-28)
- 补充 cli-hud 项目约束：Bun runtime 锁定、statusline 性能敏感路径、TDD 工作流、构建/测试快速参考

### v1.1.0 (2026-04-28)
- 由 ad-init --existing 补全：迁移 shared truth 到 `.agentic/`、修正技术栈、切到渲染入口

### v1.0.0 (2026-03-29)
- 由 ad-init 初始化生成
<!-- ad:project-guide:rendered:end -->

<!-- Manual retention area: host-specific notes may live here. -->
<!-- ad:project-guide:manual:start -->


<!-- ad:project-guide:manual:end -->
