import { describe, expect, test } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { parseCodexArgs, renderCodexSnapshot } from "./codex";
import type { PresetConfig } from "../types";

const TMP_DIR = join(import.meta.dir, "..", "..", ".test-tmp-codex-cli");
const TMP_FILE = join(TMP_DIR, "rollout.jsonl");

describe("parseCodexArgs", () => {
  test("accepts --transcript path", () => {
    expect(parseCodexArgs(["--transcript", "/tmp/rollout.jsonl"])).toEqual({
      transcriptPath: "/tmp/rollout.jsonl",
    });
  });

  test("accepts --transcript=path", () => {
    expect(parseCodexArgs(["--transcript=/tmp/rollout.jsonl"])).toEqual({
      transcriptPath: "/tmp/rollout.jsonl",
    });
  });

  test("rejects a missing transcript", () => {
    expect(() => parseCodexArgs([])).toThrow("--transcript");
    expect(() => parseCodexArgs(["--transcript"])).toThrow("--transcript");
  });
});

describe("renderCodexSnapshot", () => {
  test("rejects an unreadable rollout instead of rendering an empty snapshot", async () => {
    await expect(
      renderCodexSnapshot("/nonexistent/codex-rollout.jsonl", allEnabledPreset(), 120),
    ).rejects.toThrow("Failed to read Codex rollout");
  });

  test("renders Codex data and disables Claude-only session features", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      TMP_FILE,
      [
        { type: "session_meta", payload: { cwd: TMP_DIR, context_window: 1000 } },
        { type: "turn_context", payload: { model: "gpt-5.6-codex" } },
        {
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: { input_tokens: 200, output_tokens: 50 },
              last_token_usage: { total_tokens: 250 },
              model_context_window: 1000,
            },
          },
        },
      ].map((line) => JSON.stringify(line)).join("\n"),
    );

    const preset = allEnabledPreset();
    const output = await renderCodexSnapshot(TMP_FILE, preset, 120);
    expect(output).toContain("gpt-5.6-codex");
    expect(output).toContain("25%");
    expect(output).toContain("↓200");
    expect(preset.showSessions).toBe(true);
    expect(preset.showNotifications).toBe(true);
    rmSync(TMP_DIR, { recursive: true, force: true });
  });
});

describe("codex CLI", () => {
  const entryPoint = join(import.meta.dir, "..", "index.ts");

  test("returns a non-zero exit code when required arguments are missing", () => {
    const child = Bun.spawnSync([process.execPath, entryPoint, "codex"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain("--transcript");
  });

  test("returns a non-zero exit code when the rollout cannot be read", () => {
    const child = Bun.spawnSync([
      process.execPath,
      entryPoint,
      "codex",
      "--transcript",
      "/nonexistent/codex-rollout.jsonl",
    ], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe("");
    expect(child.stderr.toString()).toContain("Failed to read Codex rollout");
  });
});

function allEnabledPreset(): PresetConfig {
  return {
    showModel: true,
    showContextBar: true,
    showProject: false,
    showRateLimits: true,
    showTools: true,
    showAgents: true,
    showTokenUsage: true,
    showSessions: true,
    showSpeed: true,
    showNotifications: true,
    showTasks: true,
    showBackground: true,
  };
}
