import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { parseTranscript } from "./transcript";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, rmSync, writeFileSync, appendFileSync, readdirSync, unlinkSync } from "fs";

const TMP_DIR = join(import.meta.dir, "..", ".test-tmp");
const TMP_FILE = join(TMP_DIR, "test-transcript.jsonl");
const CACHE_DIR = join(homedir(), ".claude", "cli-hud-cache");

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

// 每个测试前清除增量解析缓存，避免测试间污染
beforeEach(() => {
  try {
    for (const f of readdirSync(CACHE_DIR)) {
      if (f.endsWith(".json")) unlinkSync(join(CACHE_DIR, f));
    }
  } catch {
    // 缓存目录可能不存在
  }
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function writeTranscript(lines: object[]): void {
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  writeFileSync(TMP_FILE, content);
}

describe("parseTranscript", () => {
  test("returns empty for missing path", async () => {
    const result = await parseTranscript(undefined);
    expect(result.tools).toEqual([]);
    expect(result.agents).toEqual([]);
    expect(result.usage.inputTokens).toBe(0);
  });

  test("returns empty for non-existent file", async () => {
    const result = await parseTranscript("/nonexistent/file.jsonl");
    expect(result.tools).toEqual([]);
  });

  test("extracts tool_use and tool_result", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read" }] } },
      { type: "assistant", message: { content: [{ type: "tool_result", tool_use_id: "t1" }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tools.length).toBe(1);
    expect(result.tools[0].name).toBe("Read");
    expect(result.tools[0].status).toBe("completed");
  });

  test("marks errored tool_result", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash" }] } },
      { type: "assistant", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tools[0].status).toBe("error");
  });

  test("extracts Agent entries", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "a1", name: "Agent", input: { subagent_type: "Explore", description: "search" } }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].type).toBe("Explore");
    expect(result.agents[0].description).toBe("search");
    expect(result.agents[0].status).toBe("running");
  });

  test("accumulates token usage from assistant entries", async () => {
    writeTranscript([
      { type: "assistant", message: { model: "claude-opus-4-6", usage: { input_tokens: 100, cache_creation_input_tokens: 50, cache_read_input_tokens: 200, output_tokens: 30 } } },
      { type: "assistant", message: { model: "claude-opus-4-6", usage: { input_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 50 } } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.usage.inputTokens).toBe(300);
    expect(result.usage.cacheCreationTokens).toBe(50);
    expect(result.usage.cacheReadTokens).toBe(200);
    expect(result.usage.outputTokens).toBe(80);
    expect(result.usage.model).toBe("claude-opus-4-6");
  });

  test("skips malformed lines", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read" }] } },
    ]);
    // Append a bad line
    appendFileSync(TMP_FILE, "\n{bad json\n");

    const result = await parseTranscript(TMP_FILE);
    expect(result.tools.length).toBe(1);
  });

  test("TaskCreate/TaskUpdate 不进入 tools 行（仍被过滤）", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "TaskCreate", input: { subject: "do x" } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "Read" }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tools.length).toBe(1);
    expect(result.tools[0].name).toBe("Read");
  });

  test("TaskCreate 进入 tasks[]，id 按顺序从 1 开始", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u1", name: "TaskCreate", input: { subject: "first" } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u2", name: "TaskCreate", input: { subject: "second" } }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tasks.length).toBe(2);
    expect(result.tasks[0]).toEqual({ id: "1", subject: "first", status: "pending" });
    expect(result.tasks[1]).toEqual({ id: "2", subject: "second", status: "pending" });
  });

  test("TaskUpdate 按 taskId 更新已有任务状态", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u1", name: "TaskCreate", input: { subject: "first" } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u2", name: "TaskCreate", input: { subject: "second" } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u3", name: "TaskUpdate", input: { taskId: "1", status: "in_progress" } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u4", name: "TaskUpdate", input: { taskId: "1", status: "completed" } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u5", name: "TaskUpdate", input: { taskId: "2", status: "deleted" } }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tasks[0].status).toBe("completed");
    expect(result.tasks[1].status).toBe("deleted");
  });

  test("TaskUpdate 对未知 taskId 不创建占位任务", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "u1", name: "TaskUpdate", input: { taskId: "99", status: "completed" } }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tasks.length).toBe(0);
  });

  test("Bash 带 run_in_background:true 时标记为 background", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm run dev", run_in_background: true } }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "Bash", input: { command: "ls" } }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    const bg = result.tools.find((t) => t.id === "t1")!;
    const fg = result.tools.find((t) => t.id === "t2")!;
    expect(bg.background).toBe(true);
    expect(fg.background).toBeUndefined();
  });
});
