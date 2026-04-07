import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { parseTranscript } from "./transcript";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from "fs";

const TMP_DIR = join(import.meta.dir, "..", ".test-tmp");
const TMP_FILE = join(TMP_DIR, "test-transcript.jsonl");

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
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

  test("filters out TaskCreate/TaskUpdate tools", async () => {
    writeTranscript([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "TaskCreate" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "Read" }] } },
    ]);
    const result = await parseTranscript(TMP_FILE);
    expect(result.tools.length).toBe(1);
    expect(result.tools[0].name).toBe("Read");
  });
});
