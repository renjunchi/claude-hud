import type { RenderContext } from "../types";
import { getContextPercent, getModelName, getProjectName, getGitBranch, getRateLimit5h, getRateLimit7d, formatResetCountdown, formatResetAbsolute } from "../stdin";
import { color, contextColor, bold, cyan, gray, dim } from "./colors";
import { PRESETS } from "../presets";

const FILLED = "\u25b0"; // ▰
const EMPTY = "\u25b1";  // ▱

function renderBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const clr = contextColor(percent);
  return color(FILLED.repeat(filled), clr) + color(EMPTY.repeat(empty), dim);
}

/** Render the main session line: [Model] | Context bar | ⎇ branch */
export async function renderSessionLine(ctx: RenderContext): Promise<string> {
  const preset = PRESETS[ctx.preset];
  const parts: string[] = [];

  // Model name
  if (preset.showModel) {
    const model = getModelName(ctx.stdin);
    parts.push(color(`[${model}]`, bold, cyan));
  }

  // Project name
  if (preset.showProject) {
    const project = getProjectName(ctx.stdin);
    if (project) {
      parts.push(project);
    }
  }

  // Context bar
  if (preset.showContextBar) {
    const percent = getContextPercent(ctx.stdin);
    const barWidth = ctx.termWidth > 100 ? 15 : ctx.termWidth > 60 ? 10 : 6;
    const bar = renderBar(percent, barWidth);
    const clr = contextColor(percent);
    parts.push(`${color("Context", dim)} ${bar} ${color(`${percent}%`, clr)}`);
  }

  // Git branch
  const branch = await getGitBranch(ctx.stdin.cwd);
  if (branch) {
    parts.push(color(`⎇ ${branch}`, dim));
  }

  return parts.join(color(" \u2502 ", gray)); // │ separator
}

/** Render rate limits line */
export function renderRateLimitsLine(ctx: RenderContext): string | null {
  const preset = PRESETS[ctx.preset];
  if (!preset.showRateLimits) return null;

  const rl5h = getRateLimit5h(ctx.stdin);
  const rl7d = getRateLimit7d(ctx.stdin);
  if (!rl5h && !rl7d) return null;

  const barWidth = ctx.termWidth > 100 ? 10 : 6;
  const parts: string[] = [];

  if (rl5h) {
    const bar = renderBar(rl5h.percent, barWidth);
    const resetStr = rl5h.resetsAt ? ` ↻${formatResetCountdown(rl5h.resetsAt)}` : "";
    parts.push(`${color("Current", dim)} ${bar} ${rl5h.percent}%${color(resetStr, gray)}`);
  }

  if (rl7d) {
    const bar = renderBar(rl7d.percent, barWidth);
    const resetStr = rl7d.resetsAt ? ` ↻${formatResetAbsolute(rl7d.resetsAt)}` : "";
    parts.push(`${color("All", dim)} ${bar} ${rl7d.percent}%${color(resetStr, gray)}`);
  }

  return parts.join(color(" │ ", gray));
}
