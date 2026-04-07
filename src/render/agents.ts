import type { AgentEntry } from "../types";
import { color, cyan, green, gray, dim } from "./colors";

const SPINNER = "\u25D0"; // ◐
const CHECK = "\u2713";   // ✓

/** Render agents line */
export function renderAgentsLine(agents: AgentEntry[]): string | null {
  if (agents.length === 0) return null;

  const running = agents.filter((a) => a.status === "running");
  const completed = agents.filter((a) => a.status === "completed");

  const parts: string[] = [];

  for (const agent of running) {
    const desc = agent.description ? `: ${agent.description}` : "";
    parts.push(color(`${SPINNER} ${agent.type}${desc}`, cyan));
  }

  if (completed.length > 0) {
    parts.push(color(`${CHECK} ${completed.length} agent${completed.length > 1 ? "s" : ""} done`, green));
  }

  if (parts.length === 0) return null;
  return parts.join(color(" \u2502 ", dim));
}
