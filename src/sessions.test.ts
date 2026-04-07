import { describe, test, expect } from "bun:test";
import { extractProjectName, extractSessionId, formatTimeAgo } from "./sessions";

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
