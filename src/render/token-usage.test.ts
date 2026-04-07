import { describe, test, expect } from "bun:test";
import { renderTokenUsageLine, formatTokenCount, calcOutputSpeed, formatSpeed } from "./token-usage";
import { stripAnsi } from "./colors";
import type { TokenUsage, TranscriptData } from "../types";

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

function makeTranscript(overrides: Partial<TranscriptData> = {}): TranscriptData {
  return {
    tools: [],
    agents: [],
    usage: makeUsage(),
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

describe("calcOutputSpeed", () => {
  test("returns null when no timestamps", () => {
    expect(calcOutputSpeed(makeTranscript())).toBeNull();
  });

  test("returns null when only one timestamp (same first and last)", () => {
    const t = makeTranscript({
      firstAssistantTime: "2026-04-07T12:00:00Z",
      lastAssistantTime: "2026-04-07T12:00:00Z",
    });
    expect(calcOutputSpeed(t)).toBeNull();
  });

  test("calculates correct speed", () => {
    const t = makeTranscript({
      usage: makeUsage({ outputTokens: 6000 }),
      firstAssistantTime: "2026-04-07T12:00:00Z",
      lastAssistantTime: "2026-04-07T12:01:00Z", // 60 seconds
    });
    expect(calcOutputSpeed(t)).toBe(100); // 6000 / 60
  });

  test("returns null for sub-second duration", () => {
    const t = makeTranscript({
      firstAssistantTime: "2026-04-07T12:00:00.000Z",
      lastAssistantTime: "2026-04-07T12:00:00.500Z",
    });
    expect(calcOutputSpeed(t)).toBeNull();
  });
});

describe("formatSpeed", () => {
  test("low speed with decimal", () => {
    expect(formatSpeed(5.3)).toBe("5.3 tok/s");
  });

  test("medium speed rounded", () => {
    expect(formatSpeed(42.7)).toBe("43 tok/s");
  });

  test("high speed with K suffix", () => {
    expect(formatSpeed(1500)).toBe("1.5K tok/s");
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

  test("shows speed when transcript has timestamps", () => {
    const transcript = makeTranscript({
      usage: makeUsage({ outputTokens: 6000 }),
      firstAssistantTime: "2026-04-07T12:00:00Z",
      lastAssistantTime: "2026-04-07T12:01:00Z",
    });
    const line = stripAnsi(renderTokenUsageLine(transcript.usage, transcript)!);
    expect(line).toContain("⚡100 tok/s");
  });

  test("no speed when transcript has no timestamps", () => {
    const line = stripAnsi(renderTokenUsageLine(makeUsage(), makeTranscript())!);
    expect(line).not.toContain("tok/s");
  });
});
