import { describe, test, expect } from "bun:test";
import { renderSessionsLine } from "./sessions";
import { stripAnsi } from "./colors";
import type { SessionInfo } from "../sessions";

describe("renderSessionsLine", () => {
  test("returns null for empty array", () => {
    expect(renderSessionsLine([])).toBeNull();
  });

  test("shows single session", () => {
    const sessions: SessionInfo[] = [
      { sessionId: "abc", project: "my-app", lastActivity: Date.now() - 5 * 60_000 },
    ];
    const line = stripAnsi(renderSessionsLine(sessions)!);
    expect(line).toContain("+1 session:");
    expect(line).toContain("my-app");
    expect(line).toContain("5m ago");
  });

  test("shows multiple sessions with plural", () => {
    const sessions: SessionInfo[] = [
      { sessionId: "a", project: "app-1", lastActivity: Date.now() - 3 * 60_000 },
      { sessionId: "b", project: "app-2", lastActivity: Date.now() - 10 * 60_000 },
    ];
    const line = stripAnsi(renderSessionsLine(sessions)!);
    expect(line).toContain("+2 sessions:");
    expect(line).toContain("app-1");
    expect(line).toContain("app-2");
  });

  test("limits display to 3 sessions", () => {
    const sessions: SessionInfo[] = [
      { sessionId: "a", project: "a1", lastActivity: Date.now() },
      { sessionId: "b", project: "a2", lastActivity: Date.now() },
      { sessionId: "c", project: "a3", lastActivity: Date.now() },
      { sessionId: "d", project: "a4", lastActivity: Date.now() },
    ];
    const line = stripAnsi(renderSessionsLine(sessions)!);
    expect(line).toContain("+4 sessions:");
    expect(line).not.toContain("a4");
  });
});
