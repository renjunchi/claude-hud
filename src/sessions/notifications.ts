import { join } from "path";
import { mkdirSync, renameSync } from "fs";
import type { SessionState, SessionNotification } from "../types";
import { CACHE_DIR, resolveTranscriptPath } from "./util";
import type { SessionInfo } from "./scan";

const NOTIFICATION_CACHE_PATH = join(CACHE_DIR, "notifications.json");
const SCAN_THROTTLE_MS = 2_000; // 每 2 秒扫描一次，减少 I/O
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
