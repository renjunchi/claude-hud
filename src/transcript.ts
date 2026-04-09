import { join, resolve } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { mkdirSync } from "fs";
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
}

interface CacheFile {
  transcriptPath: string;
  mtimeMs: number;
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

  // Check file state
  const file = Bun.file(transcriptPath);
  let stat: { mtimeMs: number; size: number };
  try {
    const s = await file.stat();
    stat = { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return empty;
  }

  // Try cache
  const cachePath = getCachePath(transcriptPath);
  try {
    const cacheFile = Bun.file(cachePath);
    if (await cacheFile.exists()) {
      const cached: CacheFile = await cacheFile.json();
      if (
        cached.transcriptPath === resolve(transcriptPath) &&
        cached.mtimeMs === stat.mtimeMs &&
        cached.size === stat.size &&
        cached.data.usage // cache compat: re-parse if old format
      ) {
        return {
          ...cached.data,
          skills: new Set(cached.data.skills ?? []),
        };
      }
    }
  } catch {
    // Cache miss, parse fresh
  }

  // Parse JSONL
  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  const skillSet = new Set<string>();
  const usage = emptyUsage();
  let firstAssistantTime: string | undefined;
  let lastAssistantTime: string | undefined;

  try {
    const text = await file.text();
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry: TranscriptLine = JSON.parse(line);
        processEntry(entry, toolMap, agentMap, skillSet);

        // Accumulate token usage from assistant entries
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

          // Track first/last assistant timestamps
          if (entry.timestamp) {
            if (!firstAssistantTime) firstAssistantTime = entry.timestamp;
            lastAssistantTime = entry.timestamp;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    return empty;
  }

  const result: TranscriptData = {
    tools: Array.from(toolMap.values()).slice(-20),
    agents: Array.from(agentMap.values()).slice(-10),
    skills: skillSet,
    usage,
    firstAssistantTime,
    lastAssistantTime,
  };

  // Write cache (non-fatal)
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const payload: CacheFile = {
      transcriptPath: resolve(transcriptPath),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      data: { ...result, skills: Array.from(result.skills) },
    };
    await Bun.write(cachePath, JSON.stringify(payload));
  } catch {
    // ignore
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
