import { join } from "path";
import { homedir } from "os";
import { mkdirSync, renameSync } from "fs";
import { CACHE_DIR } from "./util";

const SESSIONS_DIR = join(homedir(), ".claude", "sessions");
const SESSIONS_CACHE_PATH = join(CACHE_DIR, "sessions-state.json");

// 文件缓存 TTL（进程无状态，内存缓存无意义，改用磁盘缓存）
const PID_MAP_CACHE_TTL_MS = 5_000;
const ALIVE_CACHE_TTL_MS = 2_000;

export interface SessionFileInfo {
  pid: number;
  name?: string;
  cwd?: string;
}

export interface SessionsCacheFile {
  pidMap: { entries: [string, SessionFileInfo][]; cachedAt: number };
  aliveMap: { entries: [number, { alive: boolean; checkedAt: number }][]; cachedAt: number };
}

/** 读取磁盘缓存 */
export async function readCache(): Promise<SessionsCacheFile | null> {
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

/** 写入磁盘缓存（原子写：先写临时文件再 rename，防止并发损坏） */
export async function writeCache(cache: SessionsCacheFile): Promise<void> {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const tmpPath = `${SESSIONS_CACHE_PATH}.${process.pid}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(cache));
    renameSync(tmpPath, SESSIONS_CACHE_PATH);
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
          map.set(content.sessionId, { pid: content.pid, name: content.name, cwd: content.cwd });
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
export function checkProcessAlive(
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
