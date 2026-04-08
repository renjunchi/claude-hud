import { join } from "path";
import { homedir } from "os";

export interface SessionInfo {
  sessionId: string;
  project: string;
  lastActivity: number; // timestamp ms
  name?: string; // session name from session file
}

interface SessionFileInfo {
  pid: number;
  name?: string;
}

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");
const SESSIONS_DIR = join(homedir(), ".claude", "sessions");
const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// Cache for session PID map (refreshed every 5s)
let pidMapCache: Map<string, SessionFileInfo> | null = null;
let pidMapCacheTime = 0;
const PID_MAP_CACHE_TTL_MS = 5_000;

// Cache for process alive checks (refreshed every 2s)
const aliveCache = new Map<number, { alive: boolean; checkedAt: number }>();
const ALIVE_CACHE_TTL_MS = 2_000;

/** Check if a process is still alive via signal 0 */
export function isProcessAlive(pid: number): boolean {
  const now = Date.now();
  const cached = aliveCache.get(pid);
  if (cached && now - cached.checkedAt < ALIVE_CACHE_TTL_MS) {
    return cached.alive;
  }

  let alive: boolean;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch (err: unknown) {
    alive = (err as NodeJS.ErrnoException).code === "EPERM"; // EPERM = process exists but no permission
  }

  aliveCache.set(pid, { alive, checkedAt: now });
  return alive;
}

/** Build sessionId → { pid, name } map from ~/.claude/sessions/*.json */
export async function buildSessionPidMap(): Promise<Map<string, SessionFileInfo>> {
  const now = Date.now();
  if (pidMapCache && now - pidMapCacheTime < PID_MAP_CACHE_TTL_MS) {
    return pidMapCache;
  }

  const map = new Map<string, SessionFileInfo>();
  try {
    const glob = new Bun.Glob("*.json");
    for await (const file of glob.scan(SESSIONS_DIR)) {
      try {
        const content = await Bun.file(join(SESSIONS_DIR, file)).json();
        if (content.sessionId && typeof content.pid === "number") {
          map.set(content.sessionId, { pid: content.pid, name: content.name });
        }
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // sessions dir may not exist
  }

  pidMapCache = map;
  pidMapCacheTime = now;
  return map;
}

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

  // Verify sessions are still alive via PID check
  const pidMap = await buildSessionPidMap();
  const results: SessionInfo[] = [];

  for (const [sessionId, data] of sessions) {
    const info = pidMap.get(sessionId);
    if (info === undefined || !isProcessAlive(info.pid)) {
      continue; // no session file or confirmed dead — skip
    }
    results.push({ sessionId, ...data, name: info.name });
  }

  // Sort by most recent first
  return results.sort((a, b) => b.lastActivity - a.lastActivity);
}
