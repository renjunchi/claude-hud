import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { extractProjectName, extractSessionId, formatTimeAgo, isProcessAlive, resolveTranscriptPath, detectSessionState, humanizeDetail } from "./sessions";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, rmSync, writeFileSync } from "fs";

describe("extractProjectName", () => {
  test("extracts last path segment", () => {
    expect(extractProjectName("/Users/foo/projects/my-app")).toBe("my-app");
  });

  test("handles single segment", () => {
    expect(extractProjectName("my-app")).toBe("my-app");
  });

  test("returns empty for empty string", () => {
    expect(extractProjectName("")).toBe("");
  });
});

describe("extractSessionId", () => {
  test("extracts UUID from transcript path", () => {
    expect(
      extractSessionId("/Users/foo/.claude/projects/-proj/e905f7bd-0932-4c4d-9e9d-da06a09aef8c.jsonl"),
    ).toBe("e905f7bd-0932-4c4d-9e9d-da06a09aef8c");
  });

  test("returns empty for non-matching path", () => {
    expect(extractSessionId("/some/random/file.txt")).toBe("");
  });

  test("returns empty for empty string", () => {
    expect(extractSessionId("")).toBe("");
  });
});

describe("formatTimeAgo", () => {
  test("shows 'just now' for less than 1 minute", () => {
    expect(formatTimeAgo(Date.now() - 30_000)).toBe("just now");
  });

  test("shows minutes", () => {
    expect(formatTimeAgo(Date.now() - 5 * 60_000)).toBe("5m ago");
    expect(formatTimeAgo(Date.now() - 30 * 60_000)).toBe("30m ago");
  });

  test("shows hours", () => {
    expect(formatTimeAgo(Date.now() - 90 * 60_000)).toBe("1h ago");
    expect(formatTimeAgo(Date.now() - 3 * 60 * 60_000)).toBe("3h ago");
  });
});

describe("isProcessAlive", () => {
  test("returns true for current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  test("returns false for non-existent PID", () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });
});

describe("humanizeDetail", () => {
  test("maps known tool names", () => {
    expect(humanizeDetail("ExitPlanMode")).toBe("审批计划");
    expect(humanizeDetail("Bash")).toBe("执行命令");
  });

  test("passes through unknown names", () => {
    expect(humanizeDetail("CustomTool")).toBe("CustomTool");
  });

  test("handles comma-separated list", () => {
    expect(humanizeDetail("Bash, Write")).toBe("执行命令, 写入文件");
  });

  test("returns undefined for empty/undefined", () => {
    expect(humanizeDetail(undefined)).toBeUndefined();
    expect(humanizeDetail("")).toBeUndefined();
  });
});

describe("resolveTranscriptPath", () => {
  test("encodes cwd path correctly", () => {
    const result = resolveTranscriptPath("/Users/foo/my-app", "abc-123");
    expect(result).toBe(join(homedir(), ".claude", "projects", "-Users-foo-my-app", "abc-123.jsonl"));
  });
});

// detectSessionState 测试
const TMP_DIR = join(import.meta.dir, "..", ".test-tmp-sessions");
const TMP_FILE = join(TMP_DIR, "test-session.jsonl");

function writeLines(lines: object[]): void {
  writeFileSync(TMP_FILE, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
}

describe("detectSessionState", () => {
  beforeAll(() => mkdirSync(TMP_DIR, { recursive: true }));
  afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

  test("returns null for non-existent file", async () => {
    expect(await detectSessionState("/nonexistent/file.jsonl")).toBeNull();
  });

  test("detects turn_complete from system/turn_duration", async () => {
    writeLines([
      { type: "assistant", message: { stop_reason: "end_turn", content: [] } },
      { type: "system", subtype: "turn_duration", durationMs: 5000 },
    ]);
    const result = await detectSessionState(TMP_FILE);
    expect(result?.state).toBe("turn_complete");
  });

  test("detects waiting_permission when tool_use has no following user", async () => {
    writeLines([
      { type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "Bash" }] } },
    ]);
    const result = await detectSessionState(TMP_FILE);
    expect(result?.state).toBe("waiting_permission");
    expect(result?.detail).toBe("Bash");
  });

  test("detects working when tool_use has following user response", async () => {
    writeLines([
      { type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "Read" }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }] } },
    ]);
    const result = await detectSessionState(TMP_FILE);
    expect(result?.state).toBe("working");
  });

  test("detects turn_complete from end_turn stop_reason", async () => {
    writeLines([
      { type: "assistant", message: { stop_reason: "end_turn", content: [{ type: "text", text: "Done" }] } },
    ]);
    const result = await detectSessionState(TMP_FILE);
    expect(result?.state).toBe("turn_complete");
  });

  test("detects error from is_error in tool_result", async () => {
    writeLines([
      { type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "Bash" }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true }] } },
    ]);
    const result = await detectSessionState(TMP_FILE);
    expect(result?.state).toBe("error");
  });
});
