import { join, resolve } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { mkdirSync, renameSync } from "fs";
import type { TranscriptData, ToolEntry, AgentEntry, TokenUsage } from "./types";

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
  usage: TokenUsage;
  firstAssistantTime?: string;
  lastAssistantTime?: string;
  lastOutputTokens?: number;
  prevAssistantTime?: string;
}

interface CacheFile {
  transcriptPath: string;
  /** 已解析到的文件字节偏移（增量解析用） */
  parsedBytes: number;
  /** 上次写入缓存时的文件大小 */
  size: number;
  data: CacheData;
}

const CACHE_DIR = join(homedir(), ".claude", "claude-hud-cache");

function getCachePath(transcriptPath: string): string {
  const hash = createHash("sha256").update(resolve(transcriptPath)).digest("hex");
  return join(CACHE_DIR, `${hash}.json`);
}

export async function parseTranscript(transcriptPath?: string): Promise<TranscriptData> {
  const empty: TranscriptData = { tools: [], agents: [], skills: new Set(), usage: emptyUsage() };
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
      ? { ...cached.data, skills: new Set(cached.data.skills ?? []) }
      : empty;
  }

  // 解析新行
  const lines = newText.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry: TranscriptLine = JSON.parse(line);
      processEntry(entry, toolMap, agentMap, skillSet);

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

  const result: TranscriptData = {
    tools: Array.from(toolMap.values()).slice(-20),
    agents: Array.from(agentMap.values()).slice(-10),
    skills: skillSet,
    usage,
    firstAssistantTime,
    lastAssistantTime,
    lastOutputTokens,
    prevAssistantTime,
  };

  // 写入缓存（原子写，非致命）
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const payload: CacheFile = {
      transcriptPath: resolve(transcriptPath),
      parsedBytes: fileSize,
      size: fileSize,
      data: { ...result, skills: Array.from(result.skills) },
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
): void {
  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === "tool_use" && block.id && block.name) {
      if (block.name === "Skill") {
        const input = block.input as Record<string, unknown>;
        const skillName = input?.skill as string | undefined;
        if (skillName) skillSet.add(skillName);
      } else if (block.name === "Task" || block.name === "Agent") {
        const input = block.input as Record<string, unknown>;
        agentMap.set(block.id, {
          id: block.id,
          type: (input?.subagent_type as string) ?? "general",
          description: (input?.description as string) ?? undefined,
          status: "running",
        });
      // 过滤 Claude Code 内部任务管理工具，这些工具在 HUD 中无展示价值且产生噪音
      } else if (block.name !== "TodoWrite" && block.name !== "TaskCreate" && block.name !== "TaskUpdate") {
        toolMap.set(block.id, {
          id: block.id,
          name: block.name,
          status: "running",
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
