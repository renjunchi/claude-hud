/**
 * Statusline 主路径性能护栏
 *
 * 不进 `bun test`（文件名不含 `.test.`），由 `bun run test:perf` 显式触发。
 * 用于在重构 sessions.ts / transcript.ts 等热路径前后锁定耗时预算。
 *
 * 预算（单机绝对阈值，M 系列基准）：
 *   - typical (冷缓存, 20 工具)        < 50ms
 *   - typical (热缓存, 20 工具)        < 20ms
 *   - large   (冷缓存, 2000 工具)      < 200ms
 *
 * 注意：CI 机器性能波动较大时本测试会假阳；故只在本地 / Release 前手动跑。
 */
import { test, expect, beforeEach, afterAll } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, rmSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { resolveAndRender } from "./index";
import type { PresetConfig, StdinData } from "./types";

const TMP_DIR = join(import.meta.dir, "..", ".bench-tmp");
const CACHE_DIR = join(homedir(), ".claude", "cli-hud-cache");

const FULL_PRESET: PresetConfig = {
  showModel: true,
  showContextBar: true,
  showProject: false,
  showRateLimits: true,
  showTools: true,
  showAgents: false,
  showTokenUsage: false,
  showSessions: false, // 关闭跨会话扫描以避免读 ~/.claude/projects 引入噪声
  showSpeed: true,
  showNotifications: false,
  showTasks: true,
  showBackground: true,
};

function clearCache(): void {
  try {
    for (const f of readdirSync(CACHE_DIR)) {
      if (f.endsWith(".json")) unlinkSync(join(CACHE_DIR, f));
    }
  } catch {
    // ignore
  }
}

function writeJsonl(path: string, entries: object[]): void {
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join("\n"));
}

function makeStdin(transcriptPath: string): StdinData {
  return {
    transcript_path: transcriptPath,
    cwd: "/Users/dev/my-project",
    model: { id: "claude-opus-4-7", display_name: "Opus 4.7" },
    context_window: {
      context_window_size: 200000,
      current_usage: {
        input_tokens: 45000,
        output_tokens: 3000,
        cache_creation_input_tokens: 8000,
        cache_read_input_tokens: 12000,
      },
      used_percentage: 28,
    },
    rate_limits: {
      five_hour: { used_percentage: 35, resets_at: Date.now() + 3600_000 },
      seven_day: { used_percentage: 18, resets_at: Date.now() + 7 * 86400_000 },
    },
  };
}

/** 20 个工具 + 1 Task + 2 Skill + 1 Agent 的真实样本 */
function generateTypicalTranscript(): object[] {
  const entries: object[] = [];
  const tools = ["Read", "Edit", "Bash", "Grep", "Write"];
  for (let i = 0; i < 20; i++) {
    const id = `toolu_${i}`;
    const name = tools[i % tools.length];
    entries.push({
      type: "assistant",
      timestamp: new Date(Date.now() - (20 - i) * 5000).toISOString(),
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 2000 + i * 100,
          output_tokens: 200,
          cache_read_input_tokens: 30000,
          cache_creation_input_tokens: i === 0 ? 5000 : 0,
        },
        content: [
          { type: "tool_use", id, name, input: { file_path: `/src/foo${i}.ts` } },
        ],
      },
    });
    entries.push({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: id, is_error: false }] },
    });
  }
  entries.push({
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id: "task_1", name: "TaskCreate", input: { subject: "Fix bug" } },
        { type: "tool_use", id: "skill_1", name: "Skill", input: { skill: "review" } },
        { type: "tool_use", id: "skill_2", name: "Skill", input: { skill: "security-review" } },
        { type: "tool_use", id: "agent_1", name: "Agent", input: { subagent_type: "Explore", description: "search code" } },
      ],
    },
  });
  return entries;
}

/** 2000 个工具的大 transcript */
function generateLargeTranscript(): object[] {
  const entries: object[] = [];
  const tools = ["Read", "Edit", "Bash", "Grep", "Write"];
  for (let i = 0; i < 2000; i++) {
    const id = `toolu_${i}`;
    const name = tools[i % tools.length];
    entries.push({
      type: "assistant",
      timestamp: new Date(Date.now() - (2000 - i) * 1000).toISOString(),
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 2000,
          output_tokens: 200,
          cache_read_input_tokens: 30000,
        },
        content: [
          { type: "tool_use", id, name, input: { file_path: `/src/file${i % 50}.ts` } },
        ],
      },
    });
    entries.push({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: id }] },
    });
  }
  return entries;
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  clearCache();
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  clearCache();
});

test("typical session within 50ms (cold cache)", async () => {
  const transcriptPath = join(TMP_DIR, "typical-cold.jsonl");
  writeJsonl(transcriptPath, generateTypicalTranscript());
  const stdin = makeStdin(transcriptPath);

  const t0 = performance.now();
  const output = await resolveAndRender(stdin, FULL_PRESET, 120);
  const elapsed = performance.now() - t0;

  expect(output.length).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(50);
});

test("typical session within 20ms (warm cache)", async () => {
  const transcriptPath = join(TMP_DIR, "typical-warm.jsonl");
  writeJsonl(transcriptPath, generateTypicalTranscript());
  const stdin = makeStdin(transcriptPath);

  // warm cache (first run primes increment-parse cache)
  await resolveAndRender(stdin, FULL_PRESET, 120);

  const t0 = performance.now();
  const output = await resolveAndRender(stdin, FULL_PRESET, 120);
  const elapsed = performance.now() - t0;

  expect(output.length).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(20);
});

test("large transcript (2000 tools) within 200ms (cold cache)", async () => {
  const transcriptPath = join(TMP_DIR, "large-cold.jsonl");
  writeJsonl(transcriptPath, generateLargeTranscript());
  const stdin = makeStdin(transcriptPath);

  const t0 = performance.now();
  const output = await resolveAndRender(stdin, FULL_PRESET, 120);
  const elapsed = performance.now() - t0;

  expect(output.length).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(200);
});
