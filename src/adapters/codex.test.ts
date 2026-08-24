import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { parseCodexRollout } from "./codex";

const TMP_DIR = join(import.meta.dir, "..", "..", ".test-tmp-codex");
const TMP_FILE = join(TMP_DIR, "rollout-test.jsonl");

beforeAll(() => mkdirSync(TMP_DIR, { recursive: true }));
afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

function writeRollout(lines: object[]): void {
  writeFileSync(TMP_FILE, lines.map((line) => JSON.stringify(line)).join("\n"));
}

describe("parseCodexRollout", () => {
  test("rejects a missing rollout path", async () => {
    await expect(parseCodexRollout("/nonexistent/codex-rollout.jsonl")).rejects.toThrow(
      "Failed to read Codex rollout",
    );
  });

  test("maps session and turn metadata", async () => {
    writeRollout([
      {
        timestamp: "2026-08-05T01:00:00Z",
        type: "session_meta",
        payload: { cwd: "/work/old", context_window: 200000 },
      },
      {
        timestamp: "2026-08-05T01:00:01Z",
        type: "turn_context",
        payload: {
          cwd: "/work/project",
          model: "gpt-5.6-codex",
          collaboration_mode: { mode: "plan" },
        },
      },
    ]);

    const result = await parseCodexRollout(TMP_FILE);
    expect(result.stdin.cwd).toBe("/work/project");
    expect(result.stdin.model).toEqual({ id: "gpt-5.6-codex", display_name: "gpt-5.6-codex" });
    expect(result.stdin.context_window?.context_window_size).toBe(200000);
    expect(result.transcript.inPlanMode).toBe(true);
  });

  test("uses the latest token snapshot and last usage for context", async () => {
    writeRollout([
      tokenCount({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }, 200000),
      tokenCount(
        {
          input_tokens: 1000,
          cached_input_tokens: 400,
          cache_write_input_tokens: 25,
          output_tokens: 200,
          total_tokens: 1200,
        },
        10000,
        { input_tokens: 300, output_tokens: 100, total_tokens: 400 },
      ),
    ]);

    const result = await parseCodexRollout(TMP_FILE);
    expect(result.transcript.usage).toEqual({
      inputTokens: 575,
      cacheCreationTokens: 25,
      cacheReadTokens: 400,
      outputTokens: 200,
      model: "",
    });
    expect(result.stdin.context_window?.used_percentage).toBe(4);
  });

  test("maps rate limit windows by duration", async () => {
    const line = tokenCount({ total_tokens: 0 }, 10000);
    line.payload.rate_limits = {
      primary: { used_percent: 17.6, window_minutes: 10080, resets_at: 222 },
      secondary: { used_percent: 31.2, window_minutes: 300, resets_at: 111 },
    };
    writeRollout([line]);

    const result = await parseCodexRollout(TMP_FILE);
    expect(result.stdin.rate_limits?.five_hour).toEqual({ used_percentage: 31.2, resets_at: 111 });
    expect(result.stdin.rate_limits?.seven_day).toEqual({ used_percentage: 17.6, resets_at: 222 });
  });

  test("pairs function and custom tool calls with outputs", async () => {
    writeRollout([
      responseItem({
        type: "function_call",
        name: "exec_command",
        call_id: "call-1",
        arguments: JSON.stringify({ cmd: "bun test" }),
      }),
      responseItem({ type: "function_call_output", call_id: "call-1", output: "ok" }),
      responseItem({
        type: "custom_tool_call",
        name: "apply_patch",
        call_id: "call-2",
        input: JSON.stringify({ patch: "*** Begin Patch" }),
      }),
      responseItem({
        type: "custom_tool_call_output",
        call_id: "call-2",
        output: JSON.stringify({ isError: true }),
      }),
      responseItem({
        type: "function_call",
        name: "read_mcp_resource",
        call_id: "call-3",
        arguments: "{}",
      }),
    ]);

    const result = await parseCodexRollout(TMP_FILE);
    expect(result.transcript.tools.map(({ id, name, status }) => ({ id, name, status }))).toEqual([
      { id: "call-1", name: "exec_command", status: "completed" },
      { id: "call-2", name: "apply_patch", status: "error" },
      { id: "call-3", name: "read_mcp_resource", status: "running" },
    ]);
    expect(result.transcript.tools[0]?.summary).toContain("bun test");
  });

  test("keeps a completed call running until its output arrives", async () => {
    writeRollout([
      responseItem({
        type: "custom_tool_call",
        name: "apply_patch",
        call_id: "call-pending-output",
        status: "completed",
        input: "*** Begin Patch",
      }),
    ]);

    const result = await parseCodexRollout(TMP_FILE);
    expect(result.transcript.tools[0]?.status).toBe("running");
  });

  test("maps only the latest update_plan snapshot to tasks", async () => {
    writeRollout([
      responseItem({
        type: "function_call",
        name: "update_plan",
        call_id: "plan-1",
        arguments: JSON.stringify({ plan: [{ step: "old", status: "pending" }] }),
      }),
      responseItem({
        type: "function_call",
        name: "update_plan",
        call_id: "plan-2",
        arguments: JSON.stringify({
          plan: [
            { step: "inspect", status: "completed" },
            { step: "implement", status: "in_progress" },
          ],
        }),
      }),
    ]);

    const result = await parseCodexRollout(TMP_FILE);
    expect(result.transcript.tools).toEqual([]);
    expect(result.transcript.tasks).toEqual([
      { id: "1", subject: "inspect", status: "completed" },
      { id: "2", subject: "implement", status: "in_progress" },
    ]);
  });

  test("skips malformed lines", async () => {
    writeFileSync(
      TMP_FILE,
      `${JSON.stringify({ type: "turn_context", payload: { model: "gpt-5" } })}\n{bad json\n`,
    );
    const result = await parseCodexRollout(TMP_FILE);
    expect(result.stdin.model?.id).toBe("gpt-5");
  });
});

function responseItem(payload: Record<string, unknown>): Record<string, unknown> {
  return { timestamp: "2026-08-05T01:00:00Z", type: "response_item", payload };
}

function tokenCount(
  total: Record<string, number>,
  contextWindow: number,
  last: Record<string, number> = total,
): {
  type: string;
  payload: {
    type: string;
    info: Record<string, unknown>;
    rate_limits?: Record<string, unknown>;
  };
} {
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: total,
        last_token_usage: last,
        model_context_window: contextWindow,
      },
    },
  };
}
