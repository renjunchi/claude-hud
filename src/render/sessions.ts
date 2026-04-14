import type { SessionInfo } from "../sessions";
import type { SessionNotification } from "../types";
import { formatTimeAgo, humanizeDetail } from "../sessions";
import { color, cyan, gray, dim, yellow, red, green } from "./colors";

const MAX_DISPLAY = 3;

/** Render other active sessions line */
export function renderSessionsLine(sessions: SessionInfo[]): string | null {
  if (sessions.length === 0) return null;

  const displayed = sessions.slice(0, MAX_DISPLAY);

  // Detect duplicate project names to decide when to show session name
  const projectCounts = new Map<string, number>();
  for (const s of displayed) {
    projectCounts.set(s.project, (projectCounts.get(s.project) ?? 0) + 1);
  }

  const details = displayed
    .map((s) => {
      let label = s.project;
      if (projectCounts.get(s.project)! > 1) {
        const suffix = s.name || s.sessionId.slice(0, 6);
        label = `${s.project}:${suffix}`;
      }
      return `${label}(${formatTimeAgo(s.lastActivity)})`;
    })
    .join(" ");

  const count = color(`+${sessions.length} session${sessions.length > 1 ? "s" : ""}`, cyan);
  return `${count}${color(":", dim)} ${color(details, gray)}`;
}

/** 通知状态对应的图标和颜色 */
const NOTIFICATION_STYLE: Record<string, { icon: string; colorFn: string; label: string }> = {
  waiting_permission: { icon: "⚠", colorFn: yellow, label: "等待确认" },
  error: { icon: "✗", colorFn: red, label: "出错" },
  turn_complete: { icon: "✓", colorFn: green, label: "已完成" },
};

/** 渲染跨会话通知行 */
export function renderNotificationsLine(notifications: SessionNotification[]): string | null {
  if (notifications.length === 0) return null;

  const parts = notifications.map((n) => {
    const style = NOTIFICATION_STYLE[n.state];
    if (!style) return null;

    const project = n.project;
    const friendly = humanizeDetail(n.detail);
    const detail = friendly ? `(${friendly})` : "";
    return color(`${style.icon} ${project}:${style.label}${detail}`, style.colorFn);
  }).filter(Boolean);

  if (parts.length === 0) return null;
  return parts.join(color(" │ ", gray));
}
