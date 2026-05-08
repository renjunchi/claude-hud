import type { ToolEntry } from "../types";
import { color, green, yellow, red, dim } from "./colors";

// Braille 旋转帧；按时间戳取模选帧，让连续快照看起来在转
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// 步进 ≈ statusline 调用周期（~300ms），让相邻两次渲染恰好相邻一帧
export const SPINNER_STEP_MS = 250;
const CHECK = "✓";
const CROSS = "✗";
const MULT = "×";

function currentSpinner(): string {
  const idx = Math.floor(Date.now() / SPINNER_STEP_MS) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[idx]!;
}

/** Render active tools line */
export function renderToolsLine(tools: ToolEntry[]): string | null {
  if (tools.length === 0) return null;

  const running: ToolEntry[] = [];
  const completedCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();

  for (const tool of tools) {
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
    const label = tool.summary
      ? `${spin} ${tool.name}: ${tool.summary}`
      : `${spin} ${tool.name}`;
    parts.push(color(label, yellow));
  }

  for (const [name, count] of completedCounts) {
    const suffix = count > 1 ? ` ${MULT}${count}` : "";
    parts.push(color(`${CHECK} ${name}${suffix}`, green));
  }

  for (const [name, count] of errorCounts) {
    const suffix = count > 1 ? ` ${MULT}${count}` : "";
    parts.push(color(`${CROSS} ${name}${suffix}`, red));
  }

  if (parts.length === 0) return null;
  return parts.join(color(" │ ", dim)); // │
}
