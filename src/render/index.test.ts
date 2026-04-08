import { describe, test, expect } from "bun:test";
import { render } from "./index";
import { stripAnsi } from "./colors";
import type { RenderContext } from "../types";
import { PRESETS } from "../presets";

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    stdin: {
      model: { display_name: "Opus 4.6" },
      cwd: "/home/user/app",
      context_window: { used_percentage: 10 },
      rate_limits: {
        five_hour: { used_percentage: 20, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 5 },
      },
    },
    transcript: { tools: [], agents: [], skills: new Set(), usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, model: "" } },
    presetConfig: PRESETS.full,
    termWidth: 120,
    ...overrides,
  };
}

describe("render", () => {
  test("full preset includes session line and rate limits", async () => {
    const output = stripAnsi(await render(makeCtx()));
    expect(output).toContain("Opus 4.6");
    expect(output).toContain("Context");
    expect(output).toContain("Current");
  });

  test("essential preset hides tools and agents", async () => {
    const ctx = makeCtx({
      presetConfig: PRESETS.essential,
      transcript: {
        tools: [{ id: "1", name: "Read", status: "completed" }],
        agents: [{ id: "1", type: "Explore", status: "completed" }],
        skills: new Set(),
        usage: { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, model: "" },
      },
    });
    const output = stripAnsi(await render(ctx));
    expect(output).toContain("Opus 4.6");
    expect(output).not.toContain("Read");
    expect(output).not.toContain("agent done");
  });

  test("minimal preset shows only model", async () => {
    const output = stripAnsi(await render(makeCtx({ presetConfig: PRESETS.minimal })));
    expect(output).toContain("Opus 4.6");
    expect(output).not.toContain("Current");
    expect(output).not.toContain("All");
  });

  test("custom presetConfig with arbitrary combination", async () => {
    const custom = {
      showModel: true,
      showContextBar: false,
      showProject: false,
      showRateLimits: true,
      showTools: false,
      showAgents: false,
      showTokenUsage: false,
      showSessions: false,
      showSpeed: false,
    };
    const output = stripAnsi(await render(makeCtx({ presetConfig: custom })));
    expect(output).toContain("Opus 4.6");
    expect(output).toContain("Current");
    expect(output).not.toContain("Context"); // contextBar disabled
  });

  test("output has multiple lines", async () => {
    const output = await render(makeCtx());
    const lines = output.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
