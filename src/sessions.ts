import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

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
const CACHE_DIR = join(homedir(), ".claude", "claude-hud-cache");
const SESSIONS_CACHE_PATH = join(CACHE_DIR, "sessions-state.json");
const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// 文件缓存 TTL（进程无状态，内存缓存无意义，改用磁盘缓存）
const PID_MAP_CACHE_TTL_MS = 5_000;
const ALIVE_CACHE_TTL_MS = 2_000;

interface SessionsCacheFile {
  pidMap: { entries: [string, SessionFileInfo][]; cachedAt: number };
  aliveMap: { entries: [number, { alive: boolean; checkedAt: number }][]; cachedAt: number };
}

/** 读取磁盘缓存 */
async function readCache(): Promise<SessionsCacheFile | null> {
  try {
    const file = Bun.file(SESSIONS_CACHE_PATH);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // 缓存损坏，忽略
  }
  return null;
}

/** 写入磁盘缓存（非致命） */
async function writeCache(cache: SessionsCacheFile): Promise<void> {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    await Bun.write(SESSIONS_CACHE_PATH, JSON.stringify(cache));
  } catch {
    // 忽略
  }
}

/** Check if a process is still alive via signal 0 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code === "EPERM"; // EPERM = process exists but no permission
  }
}

/** Build sessionId → { pid, name } map from ~/.claude/sessions/*.json */
export async function buildSessionPidMap(
  diskCache: SessionsCacheFile | null,
): Promise<{ map: Map<string, SessionFileInfo>; fromCache: boolean }> {
  const now = Date.now();

  // 检查磁盘缓存是否仍然有效
  if (diskCache?.pidMap && now - diskCache.pidMap.cachedAt < PID_MAP_CACHE_TTL_MS) {
    return { map: new Map(diskCache.pidMap.entries), fromCache: true };
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

  return { map, fromCache: false };
}

/** 检查进程存活状态（带磁盘缓存） */
function checkProcessAlive(
  pid: number,
  diskCache: SessionsCacheFile | null,
): { alive: boolean; fromCache: boolean } {
  const now = Date.now();

  // 检查磁盘缓存
  if (diskCache?.aliveMap) {
    const aliveEntries = new Map(diskCache.aliveMap.entries);
    const cached = aliveEntries.get(pid);
    if (cached && now - cached.checkedAt < ALIVE_CACHE_TTL_MS) {
      return { alive: cached.alive, fromCache: true };
    }
  }

  return { alive: isProcessAlive(pid), fromCache: false };
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

  // 读取磁盘缓存
  const diskCache = await readCache();

  // Verify sessions are still alive via PID check
  const { map: pidMap, fromCache: pidFromCache } = await buildSessionPidMap(diskCache);
  const results: SessionInfo[] = [];
  const aliveUpdates = new Map<number, { alive: boolean; checkedAt: number }>();

  for (const [sessionId, data] of sessions) {
    const info = pidMap.get(sessionId);
    if (info === undefined) continue;

    const { alive, fromCache: aliveFromCache } = checkProcessAlive(info.pid, diskCache);
    if (!aliveFromCache) {
      aliveUpdates.set(info.pid, { alive, checkedAt: now });
    }
    if (!alive) continue;

    results.push({ sessionId, ...data, name: info.name });
  }

  // 更新磁盘缓存（仅在有变化时写入）
  if (!pidFromCache || aliveUpdates.size > 0) {
    const existingAlive = diskCache?.aliveMap
      ? new Map(diskCache.aliveMap.entries)
      : new Map<number, { alive: boolean; checkedAt: number }>();
    for (const [pid, status] of aliveUpdates) {
      existingAlive.set(pid, status);
    }

    const newCache: SessionsCacheFile = {
      pidMap: {
        entries: Array.from(pidMap.entries()),
        cachedAt: pidFromCache ? (diskCache?.pidMap?.cachedAt ?? now) : now,
      },
      aliveMap: {
        entries: Array.from(existingAlive.entries()),
        cachedAt: now,
      },
    };
    // 异步写入，不阻塞返回
    writeCache(newCache);
  }

  // Sort by most recent first
  return results.sort((a, b) => b.lastActivity - a.lastActivity);
}
