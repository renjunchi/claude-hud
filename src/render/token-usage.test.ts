import { describe, test, expect } from "bun:test";
import { renderTokenUsageLine, formatTokenCount } from "./token-usage";
import { stripAnsi } from "./colors";
import type { TokenUsage } from "../types";

function makeUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: 5000,
    cacheCreationTokens: 2000,
    cacheReadTokens: 10000,
    outputTokens: 1200,
    model: "claude-opus-4-6",
    ...overrides,
  };
}

describe("formatTokenCount", () => {
  test("raw number under 1K", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
  });

  test("K suffix for thousands", () => {
    expect(formatTokenCount(1000)).toBe("1.0K");
    expect(formatTokenCount(1500)).toBe("1.5K");
    expect(formatTokenCount(12345)).toBe("12K");
    expect(formatTokenCount(99999)).toBe("100K");
  });

  test("M suffix for millions", () => {
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
    expect(formatTokenCount(12_345_678)).toBe("12M");
  });
});

describe("renderTokenUsageLine", () => {
  test("returns null for zero usage", () => {
    const usage = makeUsage({ inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 });
    expect(renderTokenUsageLine(usage)).toBeNull();
  });

  test("shows input and output tokens with arrows", () => {
    const line = stripAnsi(renderTokenUsageLine(makeUsage())!);
    expect(line).toContain("↓17K"); // 5000 + 2000 + 10000
    expect(line).toContain("↑1.2K");
  });

  test("does not show cost", () => {
    const line = stripAnsi(renderTokenUsageLine(makeUsage())!);
    expect(line).not.toContain("$");
  });

  test("separates with │", () => {
    const line = stripAnsi(renderTokenUsageLine(makeUsage())!);
    expect(line).toContain("│");
  });
});
