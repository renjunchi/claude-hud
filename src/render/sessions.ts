import type { SessionInfo } from "../sessions";
import { formatTimeAgo } from "../sessions";
import { color, cyan, gray, dim } from "./colors";

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
