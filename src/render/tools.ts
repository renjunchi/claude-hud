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

function currentSpinner(): string {
  const idx = Math.floor(Date.now() / SPINNER_STEP_MS) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[idx]!;
}

/** Render active tools line (前台工具) */
export function renderToolsLine(tools: ToolEntry[]): string | null {
  if (tools.length === 0) return null;

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
    const displayName = formatToolName(tool.name);
    const label = tool.summary
      ? `${spin} ${displayName}: ${tool.summary}`
      : `${spin} ${displayName}`;
    parts.push(color(label, yellow));
  }

  for (const [name, count] of completedCounts) {
    const suffix = count > 1 ? ` ${MULT}${count}` : "";
    parts.push(color(`${CHECK} ${formatToolName(name)}${suffix}`, green));
  }

  for (const [name, count] of errorCounts) {
    const suffix = count > 1 ? ` ${MULT}${count}` : "";
    parts.push(color(`${CROSS} ${formatToolName(name)}${suffix}`, red));
  }

  if (parts.length === 0) return null;
  return parts.join(color(" │ ", dim)); // │
}

/** Render background tools line（run_in_background:true 的 Bash / Agent） */
export function renderBackgroundLine(tools: ToolEntry[]): string | null {
  const bg = tools.filter((t) => t.background);
  if (bg.length === 0) return null;

  const spin = currentSpinner();
  const parts: string[] = [color("bg:", dim)];

  for (const tool of bg) {
    const displayName = formatToolName(tool.name);
    if (tool.status === "running") {
      const label = tool.summary
        ? `${spin} ${displayName}: ${tool.summary}`
        : `${spin} ${displayName}`;
      parts.push(color(label, yellow));
    } else if (tool.status === "completed") {
      const label = tool.summary
        ? `${CHECK} ${displayName}: ${tool.summary}`
        : `${CHECK} ${displayName}`;
      parts.push(color(label, green));
    } else {
      const label = tool.summary
        ? `${CROSS} ${displayName}: ${tool.summary}`
        : `${CROSS} ${displayName}`;
      parts.push(color(label, red));
    }
  }

  // 第一段是 "bg:" 标签，后续工具用分隔符串联
  const head = parts[0]!;
  const rest = parts.slice(1);
  if (rest.length === 0) return null;
  return `${head} ${rest.join(color(" │ ", dim))}`;
}
