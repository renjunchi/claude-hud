import type { RenderContext } from "../types";
import { renderSessionLine, renderRateLimitsLine } from "./context-bar";
import { renderToolsLine, renderBackgroundLine } from "./tools";
import { renderAgentsLine } from "./agents";
import { renderTasksLine } from "./tasks";
import { renderTokenUsageLine } from "./token-usage";
import { renderSessionsLine, renderNotificationsLine } from "./sessions";
import {
  scanActiveSessions,
  scanSessionNotifications,
  extractSessionId,
  type SessionInfo,
} from "../sessions";

/** Safely execute a render function, return null on error (log to stderr) */
async function safe<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[cli-hud] render error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Render all lines based on preset */
export async function render(ctx: RenderContext): Promise<string> {
  const preset = ctx.presetConfig;
  const lines: string[] = [];

  const sessionLine = await safe(() => renderSessionLine(ctx));
  if (sessionLine) lines.push(sessionLine);

  if (preset.showRateLimits) {
    const rateLine = await safe(() => renderRateLimitsLine(ctx));
    if (rateLine) lines.push(rateLine);
  }

  if (preset.showTokenUsage) {
    const usageLine = await safe(() => renderTokenUsageLine(ctx.transcript.usage, ctx.transcript));
    if (usageLine) lines.push(usageLine);
  }

  // sessions 提到外层：showSessions 与 showNotifications 共用一次扫描
  let sessions: SessionInfo[] | null = null;
  if (preset.showSessions || preset.showNotifications) {
    sessions = await safe(() => scanActiveSessions(ctx.stdin.transcript_path));
    if (sessions && preset.showSessions) {
      const sessionsLine = renderSessionsLine(sessions, ctx.termWidth);
      if (sessionsLine) lines.push(sessionsLine);
    }
  }

  // 当前会话工具活动放在跨会话通知之前，让用户先看到自己的状态
  if (preset.showTools) {
    const toolsLine = await safe(() => renderToolsLine(ctx.transcript.tools));
    if (toolsLine) lines.push(toolsLine);
  }

  if (preset.showBackground) {
    const bgLine = await safe(() => renderBackgroundLine(ctx.transcript.tools));
    if (bgLine) lines.push(bgLine);
  }

  if (preset.showTasks) {
    const tasksLine = await safe(() => renderTasksLine(ctx.transcript.tasks));
    if (tasksLine) lines.push(tasksLine);
  }

  if (preset.showNotifications && sessions && sessions.length > 0) {
    const currentSessionId = ctx.stdin.transcript_path
      ? extractSessionId(ctx.stdin.transcript_path)
      : "";
    const notifications = await safe(() =>
      scanSessionNotifications(sessions, currentSessionId),
    );
    if (notifications) {
      const notifLine = renderNotificationsLine(notifications);
      if (notifLine) lines.push(notifLine);
    }
  }

  if (preset.showAgents) {
    const agentsLine = await safe(() => renderAgentsLine(ctx.transcript.agents));
    if (agentsLine) lines.push(agentsLine);
  }

  return lines.join("\n");
}
