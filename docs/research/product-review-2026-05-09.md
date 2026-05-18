---
title: "cli-hud 产品视角设计复盘"
doc_type: research
version: 2.0.0
status: active
created: 2026-05-09
updated: 2026-05-09
authors:
  - 任俊驰
tags:
  - product-review
  - design-review
  - cli-hud
summary: 从产品视角对 cli-hud 当前实现的全面复盘，覆盖定位/UX/通知/数据/分发/战略六类问题。v2 新增隐私、Bun runtime 代价、命名一致性、telemetry 等维度，重新校准优先级（P0 仅保留数据安全级问题），并补充"故意不做"反向清单。
---

# cli-hud 产品视角设计复盘

> 复盘范围：`src/` 全部主路径（`index.ts`、`transcript.ts`、`sessions.ts`、`watcher.ts`、`render/*`、`presets.ts`、`cli/*`、`report/*`），以及 `install.sh` / `uninstall.sh` / `commands/*` / `README.md` / `docs/design/architecture.md`。
> 评判口径：不只指出"代码不好"，而是说明"对用户意味着什么"；用中性、可操作语言，避免情绪化措辞。

## TL;DR

1. **唯一真 P0**：`install.sh` 在执行前 `git checkout -- .` 会无声丢弃用户工作区已跟踪文件的修改；其他原 P0 均降级。
2. **核心 UX 战场**：statusline 信息密度低（Skills xN、tools 三态混排、Sessions 行对单会话用户是噪声、速度指标语义不清）。
3. **隐性后台进程**：`ensureWatcher()` 在每次渲染时无条件 spawn daemon，不受 `showNotifications` 控制——产品形态实际是「状态栏 + 隐藏 daemon」，用户心智模型缺失。
4. **隐私漏报**：报告链路扫描全部历史会话生成 HTML 且无 SRI 校验，未对用户做任何告知。
5. **战略空白**：用户画像不清、无 telemetry、文档矩阵自相矛盾、强制 Bun runtime 的产品代价从未被审视。

完整结论见文末[优先级表](#优先级表)。

---

## §1 定位与认知模型

### §1.1 「Statusline」与「跨会话监视器」是两个产品被塞进一个进程
- `src/index.ts:37` 在每次 statusline 渲染中调用 `ensureWatcher()`，无条件 spawn 分离的 daemon 进程。
- daemon 与渲染流程完全解耦，但用户在 README/UI 中看不到它存在。
- `showNotifications: false` 仅关闭 UI 显示，不阻止 ensureWatcher 启动 daemon——开关名义与实际行为脱节。
- 卸载体验依赖 `disable` 删 settings；残留的 daemon 进程、PID 文件、`cli-hud-cache/` 目录都没有清理路径。

### §1.2 三档 preset 命名与语义错位
- `full` 默认**不开** `tokenUsage` / `project`，反而 `essential` 开了。`essential` ⊃ `full` 违反命名直觉。
- README 表格能纠偏，但用户首次面对名字时心智成本高。
- `agents` 在三档全部默认 `false`，README 也说"需要时显式启用"——它实质上不属于 preset 范畴。

### §1.3 `preset: "custom"` 与 README 不一致
- README 明确写："不设 preset 而仅给 show ≡ `custom`，未列出元素一律不显示"。
- 实际 `presets.ts:119-123` 的处理：
  - `preset: "custom"` + show → `CUSTOM_BASE`（全 false）
  - 仅 show（无 preset） → `PRESETS.full`（默认全开）
- 两条路径不等价，文档承诺与实现脱节。

---

## §2 核心 UX 与信息密度

Statusline 是 0.3 秒 glance UI，价值取决于"一瞥能不能转化成行动"。

### §2.1 `Skills xN` 噪声
- `context-bar.ts:51` 在主行尾部加 `Skills x3`——既不是当前激活的 skill 也不是耗费成本，仅是"本会话用过的 skill 种数"。
- 占行宽却传达不出可决策信息，应移至 report 或删除。

### §2.2 `tools` 行三态混合，决策语义弱
- `render/tools.ts` 把 running、completed-by-name、error-by-name 混成一行；completed 按工具名累加（"✓ Grep ×5"）。
- 用户真正关心的是"现在卡在什么"；已完成的累计计数本质是历史日志，不是 status。
- error 没有上下文：`✗ Bash ×2` 不告诉哪条命令、什么错——一个出错的 statusline 比没有更让人焦虑。

### §2.3 Rate Limits 的 "Current / All" 命名抽象
- `Current ▰▰▰▱▱ 32% ↻2 hr 35 min │ All ▰▰▰▰▱ 43% ↻Thu 10:00 PM`
- "Current" 实指 5h 窗，"All" 实指 7d 窗；建议用 `5h` / `7d` 直接作为 label。
- 7d 用 `Thu 10:00 PM` 跨周时歧义大；建议日期前缀 `Mon 24` 或相对天数 `+3d`。

### §2.4 `Sessions` 行对单会话用户是纯噪声
- `full` 与 `essential` 都默认 `showSessions: true`。多会话用户占比是少数；单会话用户每次都要扫一眼然后忽略。
- 项目重名时 fallback 到 `sessionId.slice(0,6)` hex 串（`render/sessions.ts:24`），人类不可读。

### §2.5 输出速度指标语义不清
- `calcOutputSpeed` (`render/token-usage.ts:18`) = `lastOutputTokens / (lastAssistantTime - prevAssistantTime)`。
- 这个间隔包含**两条 assistant 消息之间的全部时间**：工具往返（主因）、模型思考、用户审批等待。
- 显示的"⚡42 tok/s"既不是 LLM tps、也不是端到端吞吐，而是混合量——用户用它做什么决策不明。

---

## §3 跨会话通知

### §3.1 触发逻辑多源
- 两条响铃路径：(a) statusline 渲染中 `scanSessionNotifications`；(b) 后台 watcher 5s 轮询。
- 去重靠"10s 窗口 + `notifiedAt`"（`sessions.ts:449`），但磁盘缓存读写异步——多窗口并发可能各自看旧 cache 都触发 `fireBell`。
- watcher 不传 `currentSessionId`（`watcher.ts:27`），意味着无法识别"用户当前正在工作的会话"，对所有会话都响铃。前后台两边响铃叠加。

### §3.2 通知不可寻址
- 通知行只显示 `✓ project-name:已完成`，无法点击/复制路径切到那个会话。
- 没有"全局静音 30 分钟"的临时开关，只有 `showNotifications` 全有全无。

### §3.3 TTL 与状态机边界含糊
- `turn_complete` TTL = 2 分钟，`error` = 3 分钟（`sessions.ts:244`）。离开工位 5 分钟回来，错过的通知就消失——既无 inbox 也无 history。
- "长任务阈值 30 秒"（`LONG_TASK_THRESHOLD_MS`）写死，无法配置。

### §3.4 daemon 生命周期不透明
- 自动 spawn、空闲 5 分钟自退（`MAX_EMPTY_SCANS=60`）、再次渲染又被拉起。无日志、无 UI 提示。
- `cli-hud watch status` 存在但用户不会知道。
- daemon 异常占 CPU 时（如 transcript 损坏导致循环重试），用户没有任何 UX 入口察觉。

---

## §4 数据正确性、缓存与隐私

### §4.1 增量解析对"文件被改写"零防御
- `transcript.ts:103`：`canIncremental = cached.parsedBytes <= fileSize && cached.parsedBytes > 0`。
- 文件被部分覆盖到比原长度更长的极端情况下，缓存数据 + 新尾部 → tools 列表幻读。
- 缓存里没存 inode / mtime / 文件首字节签名，无法验证连续性。

### §4.2 缓存目录从不清理
- `cli-hud-cache/<sha256-of-path>.json` 永不过期。500 会话规模下累计几十 MB。
- 没有 LRU、没有过期清理、没有 `cli-hud cache clear`。

### §4.3 sessions cache 异步写"显示脏"
- `scanActiveSessions` 写缓存不 await（`sessions.ts:228`），但 statusline 进程立即结束——Bun.write 可能未 fsync 就被宿主回收。
- 表现：首次启动前几次渲染要 200ms+，PID map 总是 cache miss。

### §4.4 报告读取全部历史无知情同意（v2 新增）
- `aggregateReport` 扫描 `~/.claude/projects/` 下所有 transcript JSONL（用户与 Claude 的全部对话历史）。
- 没有任何告知"这个工具会读取我的全部历史会话"。
- 报告产物内嵌 Chart.js（fetched 自 CDN，无 SRI 校验）→ 中间人风险被放大到能在用户机器跑任意 JS（详见 §6.2）。

---

## §5 分发与生命周期

### §5.1 `install.sh` 的破坏性「静默重置」
- `install.sh:21`：`git checkout -- . 2>/dev/null || true`。
- 在用户跑 `bash install.sh` 时无声丢弃**已跟踪文件**的未提交修改（未跟踪文件保留）。
- "开发者模式"的用户极可能正在改源码——一个安装命令把工作区清空，是该立即修复的硬伤。

### §5.2 "developer mode" 不是真的 developer mode
- 安装把仓库 `rsync` 到 `~/.claude/plugins/cache/cli-hud-local/cli-hud/<ver>/`。
- 用户改源码 → 必须重跑 `install.sh` 才能生效。与文档承诺"修改源码即时生效"背离。

### §5.3 安装路径耦合宿主细节
- `install.sh` 直接读写 `known_marketplaces.json` / `installed_plugins.json`，复刻 Claude Code 内部 plugin manager 的状态结构。
- Claude Code 升级若改这套结构，cli-hud 会硬性破损。

### §5.4 Marketplace 安装的认知负担
- README 第一步 `/plugin marketplace add renjunchi/claude-hud` + `/plugin install cli-hud@cli-hud`，需要解释"两个 cli-hud 不是笔误"。
- 安装就两步，但解释占了一段——可以前置一行命令、注释紧跟。

### §5.5 没有版本告知 / 升级路径
- 装了 0.1.0 之后新版本如何提醒？目前完全没有机制。
- `/plugin update` 是宿主能力，cli-hud 自己不会在 statusline 提示"有新版"。

### §5.6 命名不一致（v2 新增）
- 仓库 `claude-hud`、CLI `cli-hud`、marketplace 名 `cli-hud`、本地路径 `tools/claude-hud`。
- 新用户从 GitHub 跳过来想 `npm i claude-hud` 会扑空。
- 基本的产品命名一致性问题。

### §5.7 强制 Bun runtime 的产品代价（v2 新增）
- 一个 statusline 工具要求用户先装 Bun。
- README「快速开始」第 1 步是装 Bun——对增长漏斗的影响显而易见，但项目从未审视该决策的产品后果。
- 备选：构建期产物 `dist/cli-hud.js` ~37KB，已经可以纯 Node 18+ 运行，但目前发行/文档没有走这条路径。

---

## §6 报告

### §6.1 命令文案与行为不一致
- `commands/report.md` 让 Bash 跑 `report --no-open`，然后告诉用户"opened in the browser"。文案与行为相反。

### §6.2 离线场景破图 + 无 SRI 校验
- `getChartJs()` 5 秒超时去 fetch CDN，失败退化成 `<script src="...cdn...">`。
- 无网用户打开 HTML 看到光秃数字表格。
- 更严重：无论 inline 还是 src，都没有 [SRI](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) integrity 校验，CDN 被劫持/MITM 时能在用户机器执行任意 JS。
- 解决方案：构建期把 Chart.js 打进 dist。

### §6.3 报告缺少"问题导向"
- 当前是消耗类仪表板：token、活跃天、模型分布。
- 用户真正想问：本周比上周省了/超了多少？哪些 skill 高 ROI？哪个项目 cache 命中率最差？
- 都隐藏在散点信息里，没有一行"建议"或"对比"。

### §6.4 数据导出缺失
- 没有 CSV / JSON 导出，没有 `--from / --to` 时间区间，没有 `--project xxx` 过滤；二次分析只能爬 transcript。

### §6.5 报告路径单一
- 永远写到 `~/.claude/cli-hud-report.html`；多设备同步（iCloud `~/.claude`）下并发覆盖；也无法生成"周报存档"。

---

## §7 可访问性 / 可观测性 / 配置体验

### §7.1 ANSI / Unicode 硬编码
- 颜色直接写 ANSI escape，不读 `NO_COLOR` env、不检测 stdout 是 pipe。
- 进度条用 `▰▱`，spinner 用 braille `⠋⠙…`，某些等宽字体下塌陷或粘连，没有 ASCII fallback。

### §7.2 颜色阈值不可改
- 70% / 90% 写死在 `colors.ts:20-22`。不区分色盲/弱视。
- 没有 `--monochrome` 以避免颜色依赖。

### §7.3 终端宽度容错
- `termWidth = process.stderr.columns || process.stdout.columns || 120`——都 `undefined` 时 fallback 120 对窄终端致命，主行通常会换行错位。

### §7.4 铃声不可配置
- `\x07` 写到 stderr，是否响铃完全取决于终端配置；用户想要"系统通知 + 不响铃"或"响铃 + 闪标签栏"都不行。

### §7.5 catch 块吃掉异常
- `safe()`（`render/index.ts:15`）写了 `console.error`，但 stderr 在 statusline 调用环境中几乎不可见。
- transcript / sessions / watcher 内部的 try-catch 全是 `// 忽略`——故障无诊断路径。

### §7.6 没有 `cli-hud doctor` / debug flag
- 期待诊断：settings.json 是否正确指向、bun 是否在 PATH、watcher 是否在跑、transcript path 是否可读、cache 目录大小。
- 没有 `CLAUDE_HUD_DEBUG=1` 把渲染中间状态落盘的开关。

### §7.7 配置无 GUI 与无项目级覆盖
- 配置全是手写 JSON；没有 `cli-hud config edit` / `set show.tools=false` / 交互式向导。
- `~/.claude/cli-hud.json` 仅全局生效；monorepo 大项目想 minimal、个人小项目想 full 做不到。
- 配置 JSON 解析失败 → 静默 fallback 到 `full`，用户无感知。

---

## §8 战略层

### §8.1 用户画像不清
- 现有功能既照顾轻度用户（minimal preset）也照顾重度多会话工作流用户（sessions、notifications、watcher daemon、报告）。
- 一个进程同时承担两类用户的代价：默认行为（full preset + 自动 ensureWatcher + 跨会话铃声）对轻度用户过度参与，对重度用户又深度不够（不能切会话、无消息中心、无项目筛选）。
- 应当明确：轻度场景 = 状态栏；重度场景 = 独立的 `cli-hud monitor` 命令（带 TUI 面板），把跨会话能力从 statusline 进程剥离。

### §8.2 缺乏价值闭环
- 用户安装 → 看到 token 用量 → 然后呢？
- 没有"本周节省 N tokens 是因命中 cache"、"长任务 12 个 / 失败 3 个 → 看 retry"等可行动洞察。
- 数据收集做了，价值释放没做。

### §8.3 与宿主生态边界不清
- Claude Code 自身在演进 statusline schema、本身也有 `/cost` 等命令。
- cli-hud 与宿主能力是替代还是补充，没有清晰说明。
- `getModelName` 直接读 `display_name` 的 schema 漂移问题是早晚要爆的雷。

### §8.4 无 telemetry / 决策靠直觉（v2 新增）
- 哪个 preset 实际被多少人选？多少人改过 show？哪条命令最常用？
- 没有任何回流通道（即使匿名）。
- 与 §8.2 价值闭环是同一根筋：数据流双向都缺。

### §8.5 测试盲区与真实场景脱节（v2 新增）
- 175 单测对应"代码正确性"，但没有任何 e2e 模拟"Claude Code 真实环境"。
- watcher 并发抢 PID、多窗口去重、transcript 旋转等真实事故场景在测试里都没有。
- 测试覆盖率高 ≠ 用户体验稳。

### §8.6 文档矩阵自相矛盾（v2 新增）
- `architecture.md` v2.0.0 写"123 个测试"
- `CLAUDE.md` v1.2.0 写"175 用例"
- `package.json` / `plugin.json` / `marketplace.json` 都停在 0.1.0 没动
- 项目的"文档保真度"已经在塌，需要建立 single source of truth。

---

## 优先级表

| 优先级 | 问题 | 锚点 | 理由 |
|---|---|---|---|
| **P0** | `install.sh` 的 `git checkout -- .` 静默丢弃修改 | §5.1 | 数据安全级 |
| **P1** | `ensureWatcher` 不受 `showNotifications` 控制 | §1.1 | 用户失控感 |
| **P1** | 跨会话通知多源响铃 + 不可寻址 | §3.1, §3.2 | 核心 UX |
| **P1** | `preset: "custom"` 行为与 README 冲突 | §1.3 | 公开承诺 |
| **P1** | 报告链路读取全部历史无知情同意 | §4.4 | 隐私 |
| **P1** | "developer mode" 不能即时生效 | §5.2 | 文档背离 |
| **P2** | tools / sessions / Skills 行决策密度低 | §2.1, §2.2, §2.4 | UX 噪声 |
| **P2** | `/cli-hud:report` 文案与 `--no-open` 不一致 | §6.1 | 轻 bug（从 P0 降级） |
| **P2** | preset 命名错位 / `agents` 该剥离 | §1.2 | 心智成本 |
| **P2** | 报告缺时间区间 / 项目过滤 / 导出 | §6.3, §6.4 | 价值天花板 |
| **P2** | Chart.js 离线破图 + 无 SRI 校验 | §6.2 | 兼容 + 安全 |
| **P3** | ANSI / Unicode / 窄终端 fallback | §7.1, §7.3 | 长尾 |
| **P3** | 命名不一致：`claude-hud` vs `cli-hud` | §5.6 | 品牌 |
| **P3** | 缺 `cli-hud doctor` / debug flag / cache cleanup | §4.2, §7.6 | 工程债 |
| **P3** | 强制 Bun runtime 的产品代价从未审视 | §5.7 | 战略 |
| **P3** | 无 telemetry → 决策靠直觉 | §8.4 | 战略 |
| **P3** | 文档矩阵自相矛盾 | §8.6 | 工程债 |

## 立刻可动的三条

1. **拆掉 `install.sh` 的 `git checkout -- .`**——可让信任用户工作丢失的硬伤。
2. **让 `ensureWatcher` 服从 `showNotifications` 开关**——否则关 UI 不等于关行为，违反最小惊讶原则。
3. **重写 `preset: "custom"` 的解析或修正 README**——文档与实现必须一致，二选一立刻改。

## 故意不做的反向清单

以下质疑被审视过但**结论是"目前不必做"**，记录以让取舍透明：

- **缓存目录不清理**：100 会话以下用户无感；优先级低于 §4.4 隐私问题。等有 `doctor` 命令时一并加 `cache clear` 子命令即可。
- **多设备同步路径**：报告写到 `~/.claude/cli-hud-report.html` 在 iCloud 同步下会冲突，但绝大多数 Claude Code 用户单机使用；属于增长后期问题。
- **i18n**：HTML 报告硬编码 zh-CN、CLI 提示中英混杂——目前用户群单一；国际化是增长后期问题。
- **`agents` 元素**：默认全关、文档已注明"实验性"；不必紧急从 preset 表剥离，但下次文档大改时应分到独立"实验功能"区。
- **3 个 preset 数量**：用户调研足够支持"加第四个 preset"之前不应增。

---

## 变更历史

### v2.0.0 (2026-05-09)
- **结构重构**：十大维度合并为八节，加 TL;DR 与 §x.x 锚点。
- **优先级重新校准**：P0 仅保留 §5.1（数据安全）；原 P0「`/cli-hud:report` 文案撒谎」降为 P2，「preset = custom」升保持 P1。
- **新增维度**：§4.4 报告链路无知情同意 / §5.6 命名不一致 / §5.7 强制 Bun runtime 代价 / §8.4 telemetry 缺失 / §8.5 测试盲区 / §8.6 文档矩阵不一致。
- **事实校准**：§7.5 stderr 由"永远看不到"改为"几乎不可见"；§5.1 明确"已跟踪文件"边界；§2.5 速度噪声主因从"用户审批"改为"工具往返"。
- **新增"故意不做的反向清单"**：让取舍透明。
- **措辞中性化**：去掉"撒谎"、"翻车"、"事故"等情绪化词汇。

### v1.0.0 (2026-05-09)
- 初次复盘：覆盖定位/配置/信息密度/通知/缓存/安装/报告/可访问性/可观测性/战略十大维度，给出 P0-P3 优先级建议。
