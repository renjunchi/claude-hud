import type { StdinData } from "./types";

/** Read all data from stdin and parse as JSON */
export async function readStdin(): Promise<StdinData> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StdinData;
  } catch {
    return {};
  }
}

/** Get context usage percentage (0-100) */
export function getContextPercent(stdin: StdinData): number {
  const cw = stdin.context_window;
  if (!cw) return 0;

  // Prefer native percentage (v2.1.6+)
  if (cw.used_percentage != null) {
    return Math.round(cw.used_percentage);
  }

  // Fallback: manual calculation
  // context_window_size 代表总上下文容量（输入+输出），需同时计入 output_tokens
  const usage = cw.current_usage;
  const size = cw.context_window_size;
  if (!usage || !size || size === 0) return 0;

  // input_tokens 已包含 cache_read_input_tokens，不重复计入
  const totalTokens =
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);

  return Math.min(100, Math.round((totalTokens / size) * 100));
}

/** Get model display name */
export function getModelName(stdin: StdinData): string {
  return stdin.model?.display_name ?? stdin.model?.id ?? "Unknown";
}

/** Get project name from cwd */
export function getProjectName(stdin: StdinData): string {
  if (!stdin.cwd) return "";
  const parts = stdin.cwd.split("/");
  return parts[parts.length - 1] ?? "";
}

/** Get rate limit info for 5-hour window */
export function getRateLimit5h(stdin: StdinData): {
  percent: number;
  resetsAt: number | null;
} | null {
  const rl = stdin.rate_limits?.five_hour;
  if (!rl || rl.used_percentage == null) return null;
  return { percent: Math.round(rl.used_percentage), resetsAt: rl.resets_at ?? null };
}

/** Get rate limit info for 7-day window */
export function getRateLimit7d(stdin: StdinData): {
  percent: number;
  resetsAt: number | null;
} | null {
  const rl = stdin.rate_limits?.seven_day;
  if (!rl || rl.used_percentage == null) return null;
  return { percent: Math.round(rl.used_percentage), resetsAt: rl.resets_at ?? null };
}

function parseHead(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("ref: refs/heads/")) {
    return trimmed.slice("ref: refs/heads/".length);
  }
  // Detached HEAD — short SHA
  return trimmed.slice(0, 7);
}

/**
 * 读取 cwd 所在仓库的当前分支与 worktree 标志。
 * 主仓库：`.git/` 是目录，HEAD 在 `.git/HEAD`。
 * worktree：`.git` 是文件，内容形如 `gitdir: /path/to/.git/worktrees/NAME`，HEAD 在该目录下。
 */
export async function getGitInfo(
  cwd?: string,
): Promise<{ branch: string; isWorktree: boolean }> {
  if (!cwd) return { branch: "", isWorktree: false };
  try {
    const { stat } = await import("fs/promises");
    let dir = cwd;
    while (dir !== "/") {
      const gitPath = `${dir}/.git`;
      try {
        const s = await stat(gitPath);
        if (s.isDirectory()) {
          const headFile = Bun.file(`${gitPath}/HEAD`);
          if (await headFile.exists()) {
            return { branch: parseHead(await headFile.text()), isWorktree: false };
          }
        } else if (s.isFile()) {
          const pointer = (await Bun.file(gitPath).text()).trim();
          const m = pointer.match(/^gitdir:\s*(.+)$/m);
          if (m && m[1]) {
            const headFile = Bun.file(`${m[1].trim()}/HEAD`);
            if (await headFile.exists()) {
              return { branch: parseHead(await headFile.text()), isWorktree: true };
            }
          }
        }
      } catch {
        // stat 失败（多半不存在），向上走
      }
      const parent = dir.replace(/\/[^/]+$/, "") || "/";
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // ignore
  }
  return { branch: "", isWorktree: false };
}

/** 兼容包装：仅返回分支名（不区分 worktree） */
export async function getGitBranch(cwd?: string): Promise<string> {
  return (await getGitInfo(cwd)).branch;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format reset time as countdown: "3 hr 35 min" */
export function formatResetCountdown(resetsAt: number | null): string {
  if (resetsAt == null) return "";
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = resetsAt - nowSec;
  if (diffSec <= 0) return "now";
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  if (h > 0) return `${h} hr${m > 0 ? ` ${m} min` : ""}`;
  return `${m} min`;
}

/** Format reset time as "Thu 10:00 PM" */
export function formatResetAbsolute(resetsAt: number | null): string {
  if (resetsAt == null) return "";
  const nowSec = Math.floor(Date.now() / 1000);
  if (resetsAt - nowSec <= 0) return "now";
  const d = new Date(resetsAt * 1000);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
  return `${WEEKDAYS[d.getDay()]} ${time}`;
}
