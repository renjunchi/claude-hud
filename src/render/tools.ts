import type { ToolEntry } from "../types";
import { color, green, yellow, red, dim } from "./colors";

const SPINNER = "\u25D0"; // ◐
const CHECK = "\u2713";   // ✓
const CROSS = "\u2717";   // ✗

/** Render active tools line */
export function renderToolsLine(tools: ToolEntry[]): string | null {
  if (tools.length === 0) return null;

  // Group completed tools by name, keep running tools separate
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

  // Running tools first
  for (const tool of running) {
    parts.push(color(`${SPINNER} ${tool.name}`, yellow));
  }

  // Completed tools (grouped)
  for (const [name, count] of completedCounts) {
    const suffix = count > 1 ? ` x${count}` : "";
    parts.push(color(`${CHECK} ${name}${suffix}`, green));
  }

  // Error tools (grouped)
  for (const [name, count] of errorCounts) {
    const suffix = count > 1 ? ` x${count}` : "";
    parts.push(color(`${CROSS} ${name}${suffix}`, red));
  }

  if (parts.length === 0) return null;
  return parts.join(color(" \u2502 ", dim)); // │
}
