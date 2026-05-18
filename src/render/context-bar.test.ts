import { describe, test, expect } from "bun:test";
import { renderSessionLine, renderRateLimitsLine } from "./context-bar";
import { stripAnsi } from "./colors";
import type { RenderContext } from "../types";
import { PRESETS } from "../presets";

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    stdin: {
      model: { display_name: "Opus 4.6 (1M context)" },
      cwd: "/home/user/my-project",
      context_window: { used_percentage: 4 },
      rate_limits: {
        five_hour: { used_percentage: 15, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 5, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    },
    transcript: { tools: [], agents: [], skills: new Set(), tasks: [], usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, model: "" } },
    presetConfig: PRESETS.full,
    termWidth: 120,
    ...overrides,
  };
}

describe("renderSessionLine", () => {
  test("includes model name", async () => {
    const line = stripAnsi(await renderSessionLine(makeCtx()));
    expect(line).toContain("[Opus 4.6 (1M context)]");
  });

  test("includes context percentage", async () => {
    const line = stripAnsi(await renderSessionLine(makeCtx()));
    expect(line).toContain("4%");
    expect(line).toContain("Context");
  });

  test("hides project when preset says so", async () => {
    const line = stripAnsi(await renderSessionLine(makeCtx({ presetConfig: PRESETS.full })));
    expect(line).not.toContain("my-project");
  });

  test("minimal preset still shows context bar", async () => {
    const line = stripAnsi(await renderSessionLine(makeCtx({ presetConfig: PRESETS.minimal })));
    expect(line).toContain("Context");
    expect(line).not.toContain("my-project");
  });

  test("uses narrower bar for small terminals", async () => {
    const wide = stripAnsi(await renderSessionLine(makeCtx({ termWidth: 120 })));
    const narrow = stripAnsi(await renderSessionLine(makeCtx({ termWidth: 50 })));
    expect(wide.length).toBeGreaterThan(narrow.length);
  });

  test("shows git branch when in a git repo", async () => {
    // Use the actual project cwd which is a git repo
    const ctx = makeCtx({ stdin: { model: { display_name: "Test" }, cwd: "/Users/renjunchi/WebServer/tools/claude-hud", context_window: { used_percentage: 4 } } });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).toContain("⎇");
  });

  test("no git branch for non-repo path", async () => {
    const ctx = makeCtx({ stdin: { model: { display_name: "Test" }, cwd: "/tmp", context_window: { used_percentage: 4 } } });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).not.toContain("⎇");
  });

  test("shows speed when showSpeed is true and transcript has timestamps", async () => {
    const ctx = makeCtx({
      presetConfig: { ...PRESETS.full, showSpeed: true },
      transcript: {
        tools: [], agents: [], skills: new Set(), tasks: [],
        usage: { inputTokens: 1000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 6000, model: "test" },
        prevAssistantTime: "2025-01-01T00:00:00Z",
        lastAssistantTime: "2025-01-01T00:01:00Z",
        lastOutputTokens: 6000,
      },
    });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).toContain("⚡100 tok/s");
  });

  test("inPlanMode=true 显示 [PLAN] 段", async () => {
    const ctx = makeCtx({
      transcript: {
        tools: [], agents: [], skills: new Set(), tasks: [],
        usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, model: "" },
        inPlanMode: true,
      },
    });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).toContain("[PLAN]");
  });

  test("inPlanMode=false 不显示 [PLAN]", async () => {
    const line = stripAnsi(await renderSessionLine(makeCtx()));
    expect(line).not.toContain("[PLAN]");
  });

  test("≥90% 时追加压缩提示 ↯", async () => {
    const ctx = makeCtx({
      stdin: {
        model: { display_name: "Test" },
        cwd: "/tmp",
        context_window: { used_percentage: 92 },
      },
    });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).toContain("92%");
    expect(line).toContain("↯");
  });

  test("<90% 时不显示压缩提示", async () => {
    const ctx = makeCtx({
      stdin: {
        model: { display_name: "Test" },
        cwd: "/tmp",
        context_window: { used_percentage: 75 },
      },
    });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).toContain("75%");
    expect(line).not.toContain("↯");
  });

  test("hides speed when showSpeed is false", async () => {
    const ctx = makeCtx({
      presetConfig: { ...PRESETS.full, showSpeed: false },
      transcript: {
        tools: [], agents: [], skills: new Set(), tasks: [],
        usage: { inputTokens: 1000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 6000, model: "test" },
        firstAssistantTime: "2025-01-01T00:00:00Z",
        lastAssistantTime: "2025-01-01T00:01:00Z",
      },
    });
    const line = stripAnsi(await renderSessionLine(ctx));
    expect(line).not.toContain("tok/s");
  });
});

describe("renderRateLimitsLine", () => {
  test("returns null when preset disables rate limits", () => {
    expect(renderRateLimitsLine(makeCtx({ presetConfig: PRESETS.minimal }))).toBeNull();
  });

  test("returns null when no rate limit data", () => {
    const ctx = makeCtx({ stdin: { rate_limits: null } });
    expect(renderRateLimitsLine(ctx)).toBeNull();
  });

  test("shows both Current and All sections", () => {
    const line = stripAnsi(renderRateLimitsLine(makeCtx())!);
    expect(line).toContain("Current");
    expect(line).toContain("15%");
    expect(line).toContain("All");
    expect(line).toContain("5%");
  });

  test("shows countdown for Current", () => {
    const line = stripAnsi(renderRateLimitsLine(makeCtx())!);
    expect(line).toMatch(/↻\d+ hr|\d+ min/);
  });

  test("shows Current with data and All with 0% when 7d is missing", () => {
    const ctx = makeCtx({
      stdin: {
        rate_limits: {
          five_hour: { used_percentage: 15, resets_at: Math.floor(Date.now() / 1000) + 3600 },
          seven_day: null,
        },
      },
    });
    const line = stripAnsi(renderRateLimitsLine(ctx)!);
    expect(line).toContain("Current");
    expect(line).toContain("15%");
    expect(line).toContain("All");
  });

  test("shows All with data and Current with 0% when 5h is missing", () => {
    const ctx = makeCtx({
      stdin: {
        rate_limits: {
          five_hour: null,
          seven_day: { used_percentage: 5, resets_at: Math.floor(Date.now() / 1000) + 86400 },
        },
      },
    });
    const line = stripAnsi(renderRateLimitsLine(ctx)!);
    expect(line).toContain("Current");
    expect(line).toContain("All");
    expect(line).toContain("5%");
  });
});
