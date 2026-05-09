import { join } from "path";
import { homedir } from "os";
import { mkdirSync, renameSync } from "fs";
import type { SessionState, SessionNotification } from "./types";

export interface SessionInfo {
  sessionId: string;
  project: string;
  lastActivity: number; // timestamp ms
  name?: string; // session name from session file
  cwd?: string; // session working directory
}

interface SessionFileInfo {
  pid: number;
  name?: string;
  cwd?: string;
}

const HISTORY_PATH = join(homedir(), ".claude", "history.jsonl");
const SESSIONS_DIR = join(homedir(), ".claude", "sessions");
const CACHE_DIR = join(homedir(), ".claude", "cli-hud-cache");
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

/** 写入磁盘缓存（原子写：先写临时文件再 rename，防止并发损坏） */
async function writeCache(cache: SessionsCacheFile): Promise<void> {
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

// ===== 跨会话通知 =====

const NOTIFICATION_CACHE_PATH = join(CACHE_DIR, "notifications.json");
const SCAN_THROTTLE_MS = 2_000; // 每 2 秒扫描一次，减少 I/O
const PROJECTS_DIR = join(homedir(), ".claude", "projects");
const INITIAL_TAIL_BYTES = 4096;  // 初始读取 4KB
const MAX_TAIL_BYTES = 65536;     // 渐进重试最大 64KB

// 通知 TTL（毫秒）
const NOTIFICATION_TTL: Record<SessionState, number> = {
  error: 3 * 60 * 1000,
  turn_complete: 2 * 60 * 1000,
  working: 0, // 不通知
};

interface NotificationCacheEntry {
  state: SessionState;
  detectedAt: number;
  lastFileSize: number;
  detail?: string;
  /** 系统通知发送时间戳（用于多窗口去重，防止重复弹窗） */
  notifiedAt?: number;
}

interface NotificationCacheFile {
  sessions: Record<string, NotificationCacheEntry>;
  lastScanAt: number;
}

/** 终端铃声（BEL），写到 stderr 因为 stdout 被 Claude Code 读取 */
function fireBell(): void {
  process.stderr.write("\x07");
}

/** 从 cwd 构建 transcript 路径 */
export function resolveTranscriptPath(cwd: string, sessionId: string): string {
  // /Users/renjunchi/app → -Users-renjunchi-app
  const encoded = cwd.replace(/\//g, "-");
  return join(PROJECTS_DIR, encoded, `${sessionId}.jsonl`);
}

interface TailEntry {
  type?: string;
  subtype?: string;
  durationMs?: number;
  message?: {
    stop_reason?: string;
    content?: Array<{
      type?: string;
      name?: string;
      is_error?: boolean;
      tool_use_id?: string;
    }>;
  };
}

/** 长任务阈值：轮次执行超过此时间才触发 turn_complete 系统通知 */
const LONG_TASK_THRESHOLD_MS = 30_000;

/** 读取 transcript 尾部并检测状态 */
export async function detectSessionState(transcriptPath: string): Promise<{ state: SessionState; detail?: string; durationMs?: number } | null> {
  try {
    const file = Bun.file(transcriptPath);
    const stat = await file.stat();
    if (stat.size === 0) return null;

    // 渐进式尾读：初始 4KB，解析失败则翻倍，最大 64KB
    // ExitPlanMode 等消息包含计划摘要，单行经常超过 4KB
    let tailBytes = INITIAL_TAIL_BYTES;

    while (tailBytes <= MAX_TAIL_BYTES) {
      const start = Math.max(0, stat.size - tailBytes);
      const slice = file.slice(start, stat.size);
      const text = await slice.text();

      // 解析行（第一行可能被截断，跳过）
      const lines = text.split("\n");
      const entries: TailEntry[] = [];
      for (let i = start > 0 ? 1 : 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          entries.push(JSON.parse(lines[i]));
        } catch {
          // skip
        }
      }

      if (entries.length === 0) {
        // 已读完整个文件仍无法解析，放弃
        if (start === 0) return null;
        // 翻倍重试
        tailBytes *= 2;
        continue;
      }

      // 从后向前分析状态
      const last = entries[entries.length - 1];

      // turn_complete: 最后是 system/turn_duration
      if (last.type === "system" && last.subtype === "turn_duration") {
        return { state: "turn_complete", durationMs: last.durationMs };
      }

      // 向后搜索 turn_duration 获取 durationMs（尾部可能有 attachment/stop_hook_summary）
      let durationMs: number | undefined;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === "system" && entries[i].subtype === "turn_duration") {
          durationMs = entries[i].durationMs;
          break;
        }
      }

      // 查找最后一条 assistant 消息
      let lastAssistantIdx = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === "assistant" && entries[i].message?.stop_reason) {
          lastAssistantIdx = i;
          break;
        }
      }

      if (lastAssistantIdx < 0) return null;
      const lastAssistant = entries[lastAssistantIdx];

      // 检查最后 assistant 之后是否有 tool_result（error）
      for (let i = lastAssistantIdx + 1; i < entries.length; i++) {
        const e = entries[i];
        if (e.type === "user" && Array.isArray(e.message?.content)) {
          for (const block of e.message!.content!) {
            if (block.is_error) {
              return { state: "error", detail: block.name };
            }
          }
        }
      }

      if (lastAssistant.message?.stop_reason === "tool_use") {
        // 不再尝试区分"等待用户确认"与"自动允许"，统一视为 working。
        // 跨会话权限白名单与用户实际 settings.json 必然不一致，会误报。
        return { state: "working" };
      }

      if (lastAssistant.message?.stop_reason === "end_turn") {
        return { state: "turn_complete", durationMs };
      }

      return { state: "working" };
    }

    // tailBytes 超过 MAX_TAIL_BYTES 仍无法解析
    return null;
  } catch {
    return null;
  }
}

/** 扫描所有活跃会话的通知 */
export async function scanSessionNotifications(
  sessions: SessionInfo[],
  currentSessionId?: string,
): Promise<SessionNotification[]> {
  if (sessions.length === 0) return [];

  const now = Date.now();

  // 读取通知缓存
  let cache: NotificationCacheFile = { sessions: {}, lastScanAt: 0 };
  try {
    const file = Bun.file(NOTIFICATION_CACHE_PATH);
    if (await file.exists()) {
      cache = await file.json();
    }
  } catch {
    // 缓存损坏
  }

  // 节流：2 秒内不重复扫描
  if (now - cache.lastScanAt < SCAN_THROTTLE_MS) {
    return buildNotifications(cache, sessions, now);
  }

  let cacheChanged = false;

  for (const session of sessions) {
    if (session.sessionId === currentSessionId) continue;
    if (!session.cwd) continue;

    const transcriptPath = resolveTranscriptPath(session.cwd, session.sessionId);

    // stat 检查文件是否变化
    let fileSize: number;
    try {
      const stat = await Bun.file(transcriptPath).stat();
      fileSize = stat.size;
    } catch {
      continue;
    }

    const cached = cache.sessions[session.sessionId];
    if (cached && cached.lastFileSize === fileSize) {
      continue; // 文件未变化，跳过
    }

    // 检测状态
    const result = await detectSessionState(transcriptPath);
    if (!result) continue;

    const prev = cached?.state;
    const isNewState = prev !== result.state;

    const detectedAt = isNewState ? now : (cached?.detectedAt ?? now);
    const alreadyNotified = cached?.notifiedAt != null && cached.notifiedAt >= detectedAt;
    // 多窗口去重：前台 statusline 和后台 watcher 可能同时扫描，
    // 窗口设为 2× 轮询间隔（10s）确保不重复弹窗
    const recentlyNotified = cached?.notifiedAt != null && (now - cached.notifiedAt < 10_000);

    // 判断是否应触发铃声
    let shouldNotify = false;
    if (result.state !== "working" && !alreadyNotified && !recentlyNotified) {
      if (result.state === "turn_complete") {
        // 只通知长任务（>30s），短问答不打扰
        shouldNotify = isNewState && (result.durationMs ?? 0) >= LONG_TASK_THRESHOLD_MS;
      } else {
        // error
        shouldNotify = isNewState;
      }
    }

    cache.sessions[session.sessionId] = {
      state: result.state,
      detectedAt,
      lastFileSize: fileSize,
      detail: result.detail,
      notifiedAt: shouldNotify ? now : (isNewState ? undefined : cached?.notifiedAt),
    };

    if (shouldNotify) fireBell();

    cacheChanged = true;
  }

  cache.lastScanAt = now;

  // 清理已消失的会话
  const activeIds = new Set(sessions.map(s => s.sessionId));
  for (const id of Object.keys(cache.sessions)) {
    if (!activeIds.has(id)) {
      delete cache.sessions[id];
      cacheChanged = true;
    }
  }

  // 写入缓存
  if (cacheChanged) {
    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      const tmpPath = `${NOTIFICATION_CACHE_PATH}.${process.pid}.tmp`;
      await Bun.write(tmpPath, JSON.stringify(cache));
      renameSync(tmpPath, NOTIFICATION_CACHE_PATH);
    } catch {
      // 忽略
    }
  }

  return buildNotifications(cache, sessions, now);
}

/** 从缓存构建通知列表（TTL 过滤） */
function buildNotifications(
  cache: NotificationCacheFile,
  sessions: SessionInfo[],
  now: number,
): SessionNotification[] {
  const sessionMap = new Map(sessions.map(s => [s.sessionId, s]));
  const notifications: SessionNotification[] = [];

  for (const [sessionId, entry] of Object.entries(cache.sessions)) {
    const ttl = NOTIFICATION_TTL[entry.state];
    if (ttl === 0) continue; // working 不通知
    if (now - entry.detectedAt > ttl) continue; // 过期

    const session = sessionMap.get(sessionId);
    if (!session) continue;

    notifications.push({
      sessionId,
      project: session.project,
      sessionName: session.name,
      state: entry.state,
      detectedAt: entry.detectedAt,
      detail: entry.detail,
    });
  }

  return notifications;
}
