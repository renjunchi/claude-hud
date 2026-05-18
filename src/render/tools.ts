import type { ToolEntry } from "../types";
import { color, green, yellow, red, dim } from "./colors";
import { formatToolName } from "./tool-name";

// Braille 旋转帧；按时间戳取模选帧，让连续快照看起来在转
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// 步进 ≈ statusline 调用周期（~300ms），让相邻两次渲染恰好相邻一帧
const SPINNER_STEP_MS = 250;
const CHECK = "✓";
const CROSS = "✗";
const MULT = "×";

const COLOR_BY_STATUS: Record<ToolEntry["status"], string> = {
  running: yellow,
  completed: green,
  error: red,
};

const ICON_BY_STATUS: Record<Exclude<ToolEntry["status"], "running">, string> = {
  completed: CHECK,
  error: CROSS,
};

function currentSpinner(): string {
  const idx = Math.floor(Date.now() / SPINNER_STEP_MS) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[idx]!;
}

const SEPARATOR = color(" │ ", dim);

interface PartOptions {
  /** 仅 running 必填 */
  spinner?: string;
  /** 显示在 "Name: summary"；前景行的 completed/error 不传 */
  summary?: string;
  /** 聚合计数，>1 显示 ×N */
  count?: number;
}

/** 单条工具的渲染单元：图标 + 名称 [+ summary] [+ ×count]，按状态着色 */
function renderToolPart(name: string, status: ToolEntry["status"], opts: PartOptions = {}): string {
  const displayName = formatToolName(name);
  const icon = status === "running" ? opts.spinner ?? "" : ICON_BY_STATUS[status];
  let body = `${icon} ${displayName}`;
  if (opts.summary) body += `: ${opts.summary}`;
  if (opts.count != null && opts.count > 1) body += ` ${MULT}${opts.count}`;
  return color(body, COLOR_BY_STATUS[status]);
}

/** Render active tools line (前台工具) */
export function renderToolsLine(tools: ToolEntry[]): string | null {
  const foreground = tools.filter((t) => !t.background);
  if (foreground.length === 0) return null;

  const running: ToolEntry[] = [];
  const completedCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();

  for (const tool of foreground) {
    if (tool.status === "running") {
      running.push(tool);
    } else if (tool.status === "completed") {
      completedCounts.set(tool.name, (completedCounts.get(tool.name) ?? 0) + 1);
    } else {
      errorCounts.set(tool.name, (errorCounts.get(tool.name) ?? 0) + 1);
    }
  }

  const parts: string[] = [];
  const spin = currentSpinner();

  for (const tool of running) {
    parts.push(renderToolPart(tool.name, "running", { spinner: spin, summary: tool.summary }));
  }
  for (const [name, count] of completedCounts) {
    parts.push(renderToolPart(name, "completed", { count }));
  }
  for (const [name, count] of errorCounts) {
    parts.push(renderToolPart(name, "error", { count }));
  }

  if (parts.length === 0) return null;
  return parts.join(SEPARATOR);
}

/** Render background tools line（run_in_background:true 的 Bash / Agent） */
export function renderBackgroundLine(tools: ToolEntry[]): string | null {
  const bg = tools.filter((t) => t.background);
  if (bg.length === 0) return null;

  const spin = currentSpinner();
  // 后台工具不聚合：每条任务都重要、单独显示，且保留 summary
  const parts = bg.map((tool) =>
    renderToolPart(tool.name, tool.status, {
      spinner: spin,
      summary: tool.summary,
    }),
  );

  return `${color("bg:", dim)} ${parts.join(SEPARATOR)}`;
}
