import { join, resolve } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { mkdirSync, renameSync } from "fs";
import type { TranscriptData, ToolEntry, AgentEntry, TaskEntry, TokenUsage } from "./types";
import { summarizeToolInput } from "./render/tool-summary";

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
    };
    content?: ContentBlock[];
  };
}

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    model: "",
  };
}

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}

interface CacheData {
  tools: ToolEntry[];
  agents: AgentEntry[];
  skills: string[];
  tasks: TaskEntry[];
  /** TaskCreate 见过的次数，用于在增量解析时延续 id 编号 */
  taskCounter: number;
  usage: TokenUsage;
  firstAssistantTime?: string;
  lastAssistantTime?: string;
  lastOutputTokens?: number;
  prevAssistantTime?: string;
  inPlanMode?: boolean;
}

interface CacheFile {
  transcriptPath: string;
  /** 已解析到的文件字节偏移（增量解析用） */
  parsedBytes: number;
  /** 上次写入缓存时的文件大小 */
  size: number;
  data: CacheData;
}

const CACHE_DIR = join(homedir(), ".claude", "cli-hud-cache");

function getCachePath(transcriptPath: string): string {
  const hash = createHash("sha256").update(resolve(transcriptPath)).digest("hex");
  return join(CACHE_DIR, `${hash}.json`);
}

export async function parseTranscript(transcriptPath?: string): Promise<TranscriptData> {
  const empty: TranscriptData = {
    tools: [],
    agents: [],
    skills: new Set(),
    tasks: [],
    usage: emptyUsage(),
  };
  if (!transcriptPath) return empty;

  // 检查文件状态
  const file = Bun.file(transcriptPath);
  let fileSize: number;
  try {
    const s = await file.stat();
    fileSize = s.size;
  } catch {
    return empty;
  }

  // 尝试读取缓存
  const cachePath = getCachePath(transcriptPath);
  let cached: CacheFile | null = null;
  try {
    const cacheFile = Bun.file(cachePath);
    if (await cacheFile.exists()) {
      const raw: CacheFile = await cacheFile.json();
      if (
        raw.transcriptPath === resolve(transcriptPath) &&
        raw.data?.usage && // 缓存格式兼容检查
        raw.parsedBytes != null
      ) {
        cached = raw;
      }
    }
  } catch {
    // 缓存损坏，全量解析
  }

  // 判断是否可增量解析：文件只增长（append-only）则只需读取新增部分
  const canIncremental = cached && cached.parsedBytes <= fileSize && cached.parsedBytes > 0;

  // 构建初始状态（从缓存恢复或全新开始）
  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  const skillSet = new Set<string>();
  const taskMap = new Map<string, TaskEntry>();
  const taskOrder: string[] = [];
  const taskCounterRef = { value: 0 };
  const planModeRef = { value: false };
  let usage: TokenUsage;
  let firstAssistantTime: string | undefined;
  let lastAssistantTime: string | undefined;
  let prevAssistantTime: string | undefined;
  let lastOutputTokens: number | undefined;

  if (canIncremental && cached) {
    // 从缓存恢复已解析状态
    for (const t of cached.data.tools) toolMap.set(t.id, { ...t });
    for (const a of cached.data.agents) agentMap.set(a.id, { ...a });
    for (const s of cached.data.skills ?? []) skillSet.add(s);
    for (const t of cached.data.tasks ?? []) {
      taskMap.set(t.id, { ...t });
      taskOrder.push(t.id);
    }
    taskCounterRef.value = cached.data.taskCounter ?? taskOrder.length;
    planModeRef.value = cached.data.inPlanMode ?? false;
    usage = { ...cached.data.usage };
    firstAssistantTime = cached.data.firstAssistantTime;
    lastAssistantTime = cached.data.lastAssistantTime;
    prevAssistantTime = cached.data.prevAssistantTime;
    lastOutputTokens = cached.data.lastOutputTokens;
  } else {
    usage = emptyUsage();
  }

  // 确定需要读取的字节范围
  const readOffset = canIncremental && cached ? cached.parsedBytes : 0;

  // 完全命中：文件未增长
  if (readOffset >= fileSize) {
    return {
      ...cached!.data,
      skills: new Set(cached!.data.skills ?? []),
      tasks: cached!.data.tasks ?? [],
    };
  }

  // 读取新增部分（增量）或全部（全量）
  let newText: string;
  try {
    if (readOffset > 0) {
      // 增量：只读取新增字节
      const slice = file.slice(readOffset, fileSize);
      newText = await slice.text();
    } else {
      newText = await file.text();
    }
  } catch {
    return canIncremental && cached
      ? {
          ...cached.data,
          skills: new Set(cached.data.skills ?? []),
          tasks: cached.data.tasks ?? [],
        }
      : empty;
  }

  // 解析新行
  const lines = newText.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry: TranscriptLine = JSON.parse(line);
      processEntry(entry, toolMap, agentMap, skillSet, taskMap, taskOrder, taskCounterRef, planModeRef);

      // 累计 token 用量
      if (entry.type === "assistant" && entry.message?.usage) {
        const u = entry.message.usage;
        const input = u.input_tokens ?? 0;
        const cacheCreation = u.cache_creation_input_tokens ?? 0;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const output = u.output_tokens ?? 0;

        usage.inputTokens += input;
        usage.cacheCreationTokens += cacheCreation;
        usage.cacheReadTokens += cacheRead;
        usage.outputTokens += output;

        if (entry.message.model) {
          usage.model = entry.message.model;
        }

        // 追踪 assistant 时间戳和速度数据
        if (entry.timestamp) {
          if (!firstAssistantTime) firstAssistantTime = entry.timestamp;
          prevAssistantTime = lastAssistantTime;
          lastAssistantTime = entry.timestamp;
          lastOutputTokens = output;
        }
      }
    } catch {
      // 跳过格式错误的行
    }
  }

  const tasks: TaskEntry[] = taskOrder
    .map((id) => taskMap.get(id))
    .filter((t): t is TaskEntry => t != null);

  const result: TranscriptData = {
    tools: Array.from(toolMap.values()).slice(-20),
    agents: Array.from(agentMap.values()).slice(-10),
    skills: skillSet,
    tasks,
    usage,
    firstAssistantTime,
    lastAssistantTime,
    lastOutputTokens,
    prevAssistantTime,
    inPlanMode: planModeRef.value,
  };

  // 写入缓存（原子写，非致命）
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const payload: CacheFile = {
      transcriptPath: resolve(transcriptPath),
      parsedBytes: fileSize,
      size: fileSize,
      data: {
        ...result,
        skills: Array.from(result.skills),
        taskCounter: taskCounterRef.value,
        inPlanMode: planModeRef.value,
      },
    };
    const tmpPath = `${cachePath}.${process.pid}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(payload));
    renameSync(tmpPath, cachePath);
  } catch {
    // 忽略
  }

  return result;
}

function processEntry(
  entry: TranscriptLine,
  toolMap: Map<string, ToolEntry>,
  agentMap: Map<string, AgentEntry>,
  skillSet: Set<string>,
  taskMap: Map<string, TaskEntry>,
  taskOrder: string[],
  taskCounterRef: { value: number },
  planModeRef: { value: boolean },
): void {
  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === "tool_use" && block.id && block.name) {
      if (block.name === "EnterPlanMode") {
        planModeRef.value = true;
      } else if (block.name === "ExitPlanMode") {
        planModeRef.value = false;
      } else if (block.name === "Skill") {
        const input = block.input as Record<string, unknown>;
        const skillName = input?.skill as string | undefined;
        if (skillName) skillSet.add(skillName);
      } else if (block.name === "TaskCreate") {
        // Claude 按 TaskCreate 顺序分配 id="1","2",...，与我们计数一致
        const input = block.input as Record<string, unknown>;
        taskCounterRef.value += 1;
        const id = String(taskCounterRef.value);
        taskMap.set(id, {
          id,
          subject: (input?.subject as string) ?? undefined,
          status: "pending",
        });
        taskOrder.push(id);
      } else if (block.name === "TaskUpdate") {
        const input = block.input as Record<string, unknown>;
        const taskId = input?.taskId as string | undefined;
        const status = input?.status as string | undefined;
        if (taskId && status) {
          const existing = taskMap.get(taskId);
          if (existing && isTaskStatus(status)) {
            existing.status = status;
          }
        }
      } else if (block.name === "Task" || block.name === "Agent") {
        const input = block.input as Record<string, unknown>;
        agentMap.set(block.id, {
          id: block.id,
          type: (input?.subagent_type as string) ?? "general",
          description: (input?.description as string) ?? undefined,
          status: "running",
        });
      // TodoWrite 仍过滤（旧版工具，已被 TaskCreate/TaskUpdate 取代）
      } else if (block.name !== "TodoWrite") {
        const input = block.input as Record<string, unknown> | undefined;
        const isBackground = input?.run_in_background === true;
        toolMap.set(block.id, {
          id: block.id,
          name: block.name,
          status: "running",
          summary: summarizeToolInput(block.name, block.input),
          background: isBackground ? true : undefined,
        });
      }
    }

    if (block.type === "tool_result" && block.tool_use_id) {
      const tool = toolMap.get(block.tool_use_id);
      if (tool) {
        tool.status = block.is_error ? "error" : "completed";
      }
      const agent = agentMap.get(block.tool_use_id);
      if (agent) {
        agent.status = "completed";
      }
    }
  }
}

function isTaskStatus(s: string): s is TaskEntry["status"] {
  return s === "pending" || s === "in_progress" || s === "completed" || s === "deleted";
}
