/**
 * sessions 模块对外门面。
 *
 * 内部按职责分 4 个子模块：
 *   - util.ts           pure helpers + 共享 CACHE_DIR
 *   - pid-monitor.ts    PID 存活检查 + pidMap/aliveMap 磁盘缓存
 *   - scan.ts           聚合 history.jsonl，输出活跃会话列表
 *   - notifications.ts  跨会话状态检测 + 通知节流
 *
 * 外部仅通过 `from "./sessions"` 引入；勿直接 import 子模块以保持封装。
 */

export {
  extractProjectName,
  extractSessionId,
  formatTimeAgo,
  resolveTranscriptPath,
} from "./util";

export { isProcessAlive, buildSessionPidMap } from "./pid-monitor";

export { scanActiveSessions, type SessionInfo } from "./scan";

export { detectSessionState, scanSessionNotifications } from "./notifications";
