import { describe, test, expect } from "bun:test";
import { renderSessionsLine, renderNotificationsLine } from "./sessions";
import { stripAnsi } from "./colors";
import type { SessionInfo } from "../sessions";
import type { SessionNotification } from "../types";

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

  test("终端过窄时只保留计数，不展开项目名与时间", () => {
    const sessions: SessionInfo[] = [
      { sessionId: "a", project: "claude-hud", lastActivity: Date.now() },
      { sessionId: "b", project: "website", lastActivity: Date.now() - 2 * 60_000 },
    ];
    const line = stripAnsi(renderSessionsLine(sessions, 50)!);
    expect(line).toBe("+2 sessions");
    expect(line).not.toContain("claude-hud");
    expect(line).not.toContain("ago");
  });

  test("展开与否的边界在 60/61 列", () => {
    const sessions: SessionInfo[] = [
      { sessionId: "a", project: "app-1", lastActivity: Date.now() },
    ];
    expect(stripAnsi(renderSessionsLine(sessions, 60)!)).toBe("+1 session");
    expect(stripAnsi(renderSessionsLine(sessions, 61)!)).toContain("app-1");
  });
});

describe("renderNotificationsLine", () => {
  test("returns null for empty array", () => {
    expect(renderNotificationsLine([])).toBeNull();
  });

  test("renders turn_complete with green icon", () => {
    const notifs: SessionNotification[] = [
      { sessionId: "a", project: "api-svc", state: "turn_complete", detectedAt: Date.now() },
    ];
    const line = stripAnsi(renderNotificationsLine(notifs)!);
    expect(line).toContain("✓");
    expect(line).toContain("api-svc:已完成");
  });

  test("renders error with red icon", () => {
    const notifs: SessionNotification[] = [
      { sessionId: "a", project: "web", state: "error", detectedAt: Date.now() },
    ];
    const line = stripAnsi(renderNotificationsLine(notifs)!);
    expect(line).toContain("✗");
    expect(line).toContain("web:出错");
  });

  test("renders multiple notifications separated by │", () => {
    const notifs: SessionNotification[] = [
      { sessionId: "a", project: "app1", state: "error", detectedAt: Date.now() },
      { sessionId: "b", project: "app2", state: "turn_complete", detectedAt: Date.now() },
    ];
    const line = stripAnsi(renderNotificationsLine(notifs)!);
    expect(line).toContain("│");
    expect(line).toContain("app1");
    expect(line).toContain("app2");
  });
});
