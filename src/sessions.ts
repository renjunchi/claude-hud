import { join } from "path";
import { homedir } from "os";

export interface SessionInfo {
  sessionId: string;
  project: string;
  lastActivity: number; // timestamp ms
}

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");
const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

interface HistoryEntry {
  sessionId?: string;
  project?: string;
  timestamp?: number;
}

/** Extract project name from full path */
export function extractProjectName(projectPath: string): string {
  const parts = projectPath.split("/");
  return parts[parts.length - 1] || "";
}

/** Extract sessionId from transcript path */
export function extractSessionId(transcriptPath: string): string {
  const match = transcriptPath.match(/([a-f0-9-]{36})\.jsonl$/);
  return match?.[1] ?? "";
}

/** Format "Xm ago" relative time */
export function formatTimeAgo(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/** Scan for active sessions from history.jsonl, excluding current session */
export async function scanActiveSessions(currentTranscriptPath?: string): Promise<SessionInfo[]> {
  const currentSessionId = currentTranscriptPath ? extractSessionId(currentTranscriptPath) : "";
  const now = Date.now();
  const cutoff = now - ACTIVE_THRESHOLD_MS;

  // Read history.jsonl
  let text: string;
  try {
    const file = Bun.file(HISTORY_PATH);
    if (!(await file.exists())) return [];
    text = await file.text();
  } catch {
    return [];
  }

  // Aggregate by sessionId, keep latest timestamp
  const sessions = new Map<string, { project: string; lastActivity: number }>();

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry: HistoryEntry = JSON.parse(line);
      if (!entry.sessionId || !entry.project || !entry.timestamp) continue;
      if (entry.sessionId === currentSessionId) continue;
      if (entry.timestamp < cutoff) continue;

      const existing = sessions.get(entry.sessionId);
      if (!existing || entry.timestamp > existing.lastActivity) {
        sessions.set(entry.sessionId, {
          project: extractProjectName(entry.project),
          lastActivity: entry.timestamp,
        });
      }
    } catch {
      // skip
    }
  }

  // Sort by most recent first
  return Array.from(sessions.entries())
    .map(([sessionId, data]) => ({ sessionId, ...data }))
    .sort((a, b) => b.lastActivity - a.lastActivity);
}
