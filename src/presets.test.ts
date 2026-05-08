import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PRESETS, resolvePresetConfig, CUSTOM_BASE } from "./presets";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm, writeFile } from "fs/promises";

describe("PRESETS", () => {
  test("has three presets", () => {
    expect(Object.keys(PRESETS)).toEqual(["full", "essential", "minimal"]);
  });

  test("full preset shows model, context bar, rate limits, and sessions", () => {
    expect(PRESETS.full.showModel).toBe(true);
    expect(PRESETS.full.showContextBar).toBe(true);
    expect(PRESETS.full.showRateLimits).toBe(true);
    expect(PRESETS.full.showAgents).toBe(false);
    expect(PRESETS.full.showTokenUsage).toBe(false);
    expect(PRESETS.full.showSessions).toBe(true);
  });

  test("essential preset shows tools but hides agents", () => {
    expect(PRESETS.essential.showModel).toBe(true);
    expect(PRESETS.essential.showTools).toBe(true);
    expect(PRESETS.essential.showAgents).toBe(false);
  });

  test("full preset shows tools", () => {
    expect(PRESETS.full.showTools).toBe(true);
  });

  test("minimal preset shows only model and context", () => {
    expect(PRESETS.minimal.showModel).toBe(true);
    expect(PRESETS.minimal.showContextBar).toBe(true);
    expect(PRESETS.minimal.showProject).toBe(false);
    expect(PRESETS.minimal.showRateLimits).toBe(false);
    expect(PRESETS.minimal.showTools).toBe(false);
    expect(PRESETS.minimal.showAgents).toBe(false);
  });

  test("all presets have all required fields", () => {
    const requiredFields = ["showModel", "showContextBar", "showProject", "showRateLimits", "showTools", "showAgents", "showTokenUsage", "showSessions"];
    for (const [name, preset] of Object.entries(PRESETS)) {
      for (const field of requiredFields) {
        expect(typeof (preset as Record<string, unknown>)[field]).toBe("boolean");
      }
    }
  });
});

describe("resolvePresetConfig", () => {
  let tmpDir: string;
  let configPath: string;
  const origEnv = process.env.CLAUDE_HUD_PRESET;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "hud-test-"));
    configPath = join(tmpDir, "cli-hud.json");
    delete process.env.CLAUDE_HUD_PRESET;
  });

  afterEach(async () => {
    if (origEnv !== undefined) {
      process.env.CLAUDE_HUD_PRESET = origEnv;
    } else {
      delete process.env.CLAUDE_HUD_PRESET;
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("scenario A: pure preset returns matching PRESETS", async () => {
    await writeFile(configPath, JSON.stringify({ preset: "essential" }));
    const config = await resolvePresetConfig(configPath);
    expect(config).toEqual(PRESETS.essential);
  });

  test("scenario B: preset + show override", async () => {
    await writeFile(configPath, JSON.stringify({ preset: "full", show: { sessions: false } }));
    const config = await resolvePresetConfig(configPath);
    expect(config.showSessions).toBe(false);
    expect(config.showModel).toBe(true);
    expect(config.showRateLimits).toBe(true);
  });

  test("scenario C: custom preset + show", async () => {
    await writeFile(configPath, JSON.stringify({ preset: "custom", show: { model: true, contextBar: true } }));
    const config = await resolvePresetConfig(configPath);
    expect(config.showModel).toBe(true);
    expect(config.showContextBar).toBe(true);
    expect(config.showRateLimits).toBe(false);
    expect(config.showSessions).toBe(false);
    expect(config.showTools).toBe(false);
  });

  test("scenario D: only show, no preset → full base with overrides", async () => {
    await writeFile(configPath, JSON.stringify({ show: { model: true } }));
    const config = await resolvePresetConfig(configPath);
    expect(config.showModel).toBe(true);
    // 基于 full preset，未被 show 覆盖的字段保持 full 默认值
    expect(config.showContextBar).toBe(true);
    expect(config.showRateLimits).toBe(true);
    expect(config.showSessions).toBe(true);
  });

  test("env var overrides file preset, show still applies", async () => {
    process.env.CLAUDE_HUD_PRESET = "minimal";
    await writeFile(configPath, JSON.stringify({ preset: "full", show: { sessions: true } }));
    const config = await resolvePresetConfig(configPath);
    // base is minimal (from env), then show overrides sessions
    expect(config.showRateLimits).toBe(false); // minimal
    expect(config.showSessions).toBe(true); // show override
  });

  test("env var takes priority over file preset", async () => {
    process.env.CLAUDE_HUD_PRESET = "minimal";
    await writeFile(configPath, JSON.stringify({ preset: "full" }));
    const config = await resolvePresetConfig(configPath);
    expect(config).toEqual(PRESETS.minimal);
  });

  test("invalid show key warns to stderr, does not crash", async () => {
    const stderrWrite = console.error;
    const warnings: string[] = [];
    console.error = (msg: string) => warnings.push(msg);
    try {
      await writeFile(configPath, JSON.stringify({ show: { bogus: true, model: true } }));
      const config = await resolvePresetConfig(configPath);
      expect(config.showModel).toBe(true);
      expect(warnings.some((w) => w.includes("bogus"))).toBe(true);
    } finally {
      console.error = stderrWrite;
    }
  });

  test("non-boolean show value is ignored", async () => {
    // 使用 custom preset 作为基础，确保非 boolean 值被忽略而非应用
    await writeFile(configPath, JSON.stringify({ preset: "custom", show: { model: "yes", contextBar: true } }));
    const config = await resolvePresetConfig(configPath);
    expect(config.showModel).toBe(false); // "yes" is not boolean, ignored; custom base = false
    expect(config.showContextBar).toBe(true);
  });

  test("corrupt JSON falls back to full preset", async () => {
    await writeFile(configPath, "not valid json {{{");
    const config = await resolvePresetConfig(configPath);
    expect(config).toEqual(PRESETS.full);
  });

  test("no config file returns full preset", async () => {
    const config = await resolvePresetConfig(join(tmpDir, "nonexistent.json"));
    expect(config).toEqual(PRESETS.full);
  });

  test("empty config {} returns full preset", async () => {
    await writeFile(configPath, JSON.stringify({}));
    const config = await resolvePresetConfig(configPath);
    expect(config).toEqual(PRESETS.full);
  });
});
