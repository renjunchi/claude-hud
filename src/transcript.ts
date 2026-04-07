import { join, resolve } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
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

interface CacheFile {
  transcriptPath: string;
  mtimeMs: number;
  size: number;
  data: TranscriptData;
}

const CACHE_DIR = join(homedir(), ".claude", "claude-hud-cache");

function getCachePath(transcriptPath: string): string {
  const hash = createHash("sha256").update(resolve(transcriptPath)).digest("hex");
  return join(CACHE_DIR, `${hash}.json`);
}

export async function parseTranscript(transcriptPath?: string): Promise<TranscriptData> {
  const empty: TranscriptData = { tools: [], agents: [], usage: emptyUsage() };
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
        return cached.data;
      }
    }
  } catch {
    // Cache miss, parse fresh
  }

  // Parse JSONL
  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  const usage = emptyUsage();

  try {
    const text = await file.text();
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry: TranscriptLine = JSON.parse(line);
        processEntry(entry, toolMap, agentMap);

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
    usage,
  };

  // Write cache (non-fatal)
  try {
    const { mkdirSync } = await import("fs");
    mkdirSync(CACHE_DIR, { recursive: true });
    const payload: CacheFile = {
      transcriptPath: resolve(transcriptPath),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      data: result,
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
): void {
  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === "tool_use" && block.id && block.name) {
      if (block.name === "Task" || block.name === "Agent") {
        const input = block.input as Record<string, unknown>;
        agentMap.set(block.id, {
          id: block.id,
          type: (input?.subagent_type as string) ?? "general",
          description: (input?.description as string) ?? undefined,
          status: "running",
        });
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
