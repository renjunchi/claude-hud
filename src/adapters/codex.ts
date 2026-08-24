import type { StdinData, TaskEntry, TokenUsage, ToolEntry, TranscriptData } from "../types";
import { summarizeToolInput } from "../render/tool-summary";

export interface CodexAdapterResult {
  stdin: StdinData;
  transcript: TranscriptData;
}

interface RolloutEntry {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface UsageSnapshot {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
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

function emptyResult(): CodexAdapterResult {
  return {
    stdin: {},
    transcript: {
      tools: [],
      agents: [],
      skills: new Set(),
      tasks: [],
      usage: emptyUsage(),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseUsage(value: unknown): UsageSnapshot {
  if (!isRecord(value)) return {};
  return {
    input_tokens: finiteNumber(value.input_tokens),
    cached_input_tokens: finiteNumber(value.cached_input_tokens),
    cache_write_input_tokens: finiteNumber(value.cache_write_input_tokens),
    output_tokens: finiteNumber(value.output_tokens),
    total_tokens: finiteNumber(value.total_tokens),
  };
}

function normalizeUsage(snapshot: UsageSnapshot, model: string): TokenUsage {
  const cached = snapshot.cached_input_tokens ?? 0;
  const cacheWrite = snapshot.cache_write_input_tokens ?? 0;
  // Codex reports cached/cache-write tokens as subsets of input_tokens. The shared
  // renderer adds these buckets, so keep only uncached input in inputTokens.
  const uncachedInput = Math.max(0, (snapshot.input_tokens ?? 0) - cached - cacheWrite);
  return {
    inputTokens: uncachedInput,
    cacheCreationTokens: cacheWrite,
    cacheReadTokens: cached,
    outputTokens: snapshot.output_tokens ?? 0,
    model,
  };
}

function initialToolStatus(value: unknown): ToolEntry["status"] {
  if (value === "failed" || value === "error") return "error";
  return "running";
}

function outputIsError(value: unknown): boolean {
  const object = parseObject(value);
  if (!object) return false;
  return object.isError === true || object.is_error === true || object.success === false;
}

function taskStatus(value: unknown): TaskEntry["status"] | undefined {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "deleted"
  ) {
    return value;
  }
  return undefined;
}

function tasksFromPlan(args: Record<string, unknown> | undefined): TaskEntry[] | undefined {
  if (!args || !Array.isArray(args.plan)) return undefined;
  const tasks: TaskEntry[] = [];
  for (const [index, item] of args.plan.entries()) {
    if (!isRecord(item)) continue;
    const status = taskStatus(item.status);
    if (!status) continue;
    tasks.push({
      id: String(index + 1),
      subject: stringValue(item.step),
      status,
    });
  }
  return tasks;
}

function summarizeCodexTool(
  name: string,
  args: Record<string, unknown> | undefined,
): string | undefined {
  if (!args) return undefined;
  if (name === "exec_command") {
    return summarizeToolInput("Bash", { command: args.cmd, description: args.justification });
  }
  return summarizeToolInput(name, args);
}

function applyRateLimits(stdin: StdinData, value: unknown): void {
  if (!isRecord(value)) return;
  const rateLimits: NonNullable<StdinData["rate_limits"]> = {};

  for (const key of ["primary", "secondary", "individual_limit"] as const) {
    const window = value[key];
    if (!isRecord(window)) continue;
    const minutes = finiteNumber(window.window_minutes);
    const used = finiteNumber(window.used_percent);
    if (minutes == null || used == null) continue;
    const mapped = {
      used_percentage: used,
      resets_at: finiteNumber(window.resets_at) ?? null,
    };
    if (minutes === 300) rateLimits.five_hour = mapped;
    if (minutes === 10080) rateLimits.seven_day = mapped;
  }

  if (rateLimits.five_hour || rateLimits.seven_day) stdin.rate_limits = rateLimits;
}

/** Parse a Codex rollout JSONL snapshot into cli-hud's provider-neutral render model. */
export async function parseCodexRollout(transcriptPath?: string): Promise<CodexAdapterResult> {
  if (!transcriptPath) return emptyResult();

  let text: string;
  try {
    text = await Bun.file(transcriptPath).text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read Codex rollout "${transcriptPath}": ${detail}`, {
      cause: error,
    });
  }

  const stdin: StdinData = { transcript_path: transcriptPath };
  const toolMap = new Map<string, ToolEntry>();
  let tasks: TaskEntry[] = [];
  let usage = emptyUsage();
  let model = "";
  let firstAssistantTime: string | undefined;
  let lastAssistantTime: string | undefined;
  let prevAssistantTime: string | undefined;
  let lastOutputTokens: number | undefined;
  let inPlanMode = false;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: RolloutEntry;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) continue;
      entry = parsed;
    } catch {
      continue;
    }

    const payload = entry.payload;
    if (!payload) continue;

    if (entry.type === "session_meta") {
      stdin.cwd = stringValue(payload.cwd) ?? stdin.cwd;
      const contextWindow = finiteNumber(payload.context_window);
      if (contextWindow != null) {
        stdin.context_window = {
          ...stdin.context_window,
          context_window_size: contextWindow,
        };
      }
      continue;
    }

    if (entry.type === "turn_context") {
      stdin.cwd = stringValue(payload.cwd) ?? stdin.cwd;
      model = stringValue(payload.model) ?? model;
      if (model) stdin.model = { id: model, display_name: model };
      const collaborationMode = isRecord(payload.collaboration_mode)
        ? payload.collaboration_mode
        : undefined;
      const mode = collaborationMode
        ? stringValue(collaborationMode.mode) ?? stringValue(collaborationMode.kind)
        : undefined;
      inPlanMode = mode === "plan";
      continue;
    }

    if (entry.type === "event_msg") {
      if (payload.type === "agent_message" && entry.timestamp) {
        if (!firstAssistantTime) firstAssistantTime = entry.timestamp;
        prevAssistantTime = lastAssistantTime;
        lastAssistantTime = entry.timestamp;
      }
      if (payload.type !== "token_count") continue;
      const info = isRecord(payload.info) ? payload.info : undefined;
      if (info) {
        const total = parseUsage(info.total_token_usage);
        const last = parseUsage(info.last_token_usage);
        usage = normalizeUsage(total, model);
        lastOutputTokens = last.output_tokens;
        const contextWindow = finiteNumber(info.model_context_window);
        const usedTokens = last.total_tokens;
        stdin.context_window = {
          ...stdin.context_window,
          context_window_size: contextWindow ?? stdin.context_window?.context_window_size,
          current_usage: usedTokens == null ? stdin.context_window?.current_usage : {
            input_tokens: usedTokens,
          },
          used_percentage:
            contextWindow && usedTokens != null
              ? Math.min(100, (usedTokens / contextWindow) * 100)
              : stdin.context_window?.used_percentage,
        };
      }
      applyRateLimits(stdin, payload.rate_limits);
      continue;
    }

    if (entry.type !== "response_item") continue;
    const itemType = stringValue(payload.type);
    if (itemType === "function_call" || itemType === "custom_tool_call") {
      const id = stringValue(payload.call_id) ?? stringValue(payload.id);
      const name = stringValue(payload.name);
      if (!id || !name) continue;
      const args = parseObject(itemType === "function_call" ? payload.arguments : payload.input);
      if (name === "update_plan") {
        const latestTasks = tasksFromPlan(args);
        if (latestTasks) tasks = latestTasks;
        continue;
      }
      toolMap.set(id, {
        id,
        name,
        // A call-level "completed" status means the call payload was fully emitted,
        // not that the external tool finished. Only a matching output completes it.
        status: initialToolStatus(payload.status),
        summary: summarizeCodexTool(name, args),
      });
      continue;
    }

    if (itemType === "function_call_output" || itemType === "custom_tool_call_output") {
      const id = stringValue(payload.call_id) ?? stringValue(payload.id);
      if (!id) continue;
      const tool = toolMap.get(id);
      if (tool) tool.status = outputIsError(payload.output) ? "error" : "completed";
    }
  }

  if (model && !usage.model) usage.model = model;
  return {
    stdin,
    transcript: {
      tools: Array.from(toolMap.values()).slice(-20),
      agents: [],
      skills: new Set(),
      tasks,
      usage,
      firstAssistantTime,
      lastAssistantTime,
      prevAssistantTime,
      lastOutputTokens,
      inPlanMode,
    },
  };
}
