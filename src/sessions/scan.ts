import { join } from "path";
import { homedir } from "os";
import { extractProjectName, extractSessionId } from "./util";
import {
  buildSessionPidMap,
  checkProcessAlive,
  readCache,
  writeCache,
  type SessionsCacheFile,
} from "./pid-monitor";

export interface SessionInfo {
  sessionId: string;
  project: string;
  lastActivity: number; // timestamp ms
  name?: string; // session name from session file
  cwd?: string; // session working directory
}

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");
const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

interface HistoryEntry {
  sessionId?: string;
  project?: string;
  timestamp?: number;
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

    results.push({ sessionId, ...data, name: info.name, cwd: info.cwd });
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
