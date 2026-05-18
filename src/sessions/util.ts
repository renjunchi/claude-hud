import { join } from "path";
import { homedir } from "os";

/** 共享缓存目录（pid-monitor / notifications 各自管理子文件） */
export const CACHE_DIR = join(homedir(), ".claude", "cli-hud-cache");

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

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

/** 从 cwd 构建 transcript 路径 */
export function resolveTranscriptPath(cwd: string, sessionId: string): string {
  // /Users/renjunchi/app → -Users-renjunchi-app
  const encoded = cwd.replace(/\//g, "-");
  return join(PROJECTS_DIR, encoded, `${sessionId}.jsonl`);
}
