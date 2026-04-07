import type { SessionInfo } from "../sessions";
import { formatTimeAgo } from "../sessions";
import { color, cyan, gray, dim } from "./colors";

const MAX_DISPLAY = 3;

/** Render other active sessions line */
export function renderSessionsLine(sessions: SessionInfo[]): string | null {
  if (sessions.length === 0) return null;

  const displayed = sessions.slice(0, MAX_DISPLAY);
  const details = displayed
    .map((s) => `${s.project}(${formatTimeAgo(s.lastActivity)})`)
    .join(" ");

  const count = color(`+${sessions.length} session${sessions.length > 1 ? "s" : ""}`, cyan);
  return `${count}${color(":", dim)} ${color(details, gray)}`;
}
