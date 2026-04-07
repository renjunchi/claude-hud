import { describe, test, expect } from "bun:test";
import { PRESETS } from "./presets";

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

  test("essential preset hides tools and agents", () => {
    expect(PRESETS.essential.showModel).toBe(true);
    expect(PRESETS.essential.showTools).toBe(false);
    expect(PRESETS.essential.showAgents).toBe(false);
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
