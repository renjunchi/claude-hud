import type { RenderContext } from "../types";
import { getContextPercent, getModelName, getProjectName, getGitInfo, getRateLimit5h, getRateLimit7d, formatResetCountdown, formatResetAbsolute } from "../stdin";
import { color, contextColor, bold, cyan, gray, dim, yellow } from "./colors";
import { calcOutputSpeed, formatSpeed } from "./token-usage";
import { NARROW_TERM_WIDTH, WIDE_TERM_WIDTH } from "../term-width";

const FILLED = "\u25b0"; // ▰
const EMPTY = "\u25b1";  // ▱

/** 返回 0 表示终端过窄，不渲染进度条 */
function barWidthFor(termWidth: number, wide: number, normal: number): number {
  if (termWidth <= NARROW_TERM_WIDTH) return 0;
  return termWidth > WIDE_TERM_WIDTH ? wide : normal;
}

function renderBar(percent: number, width: number): string {
  if (width <= 0) return "";
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const clr = contextColor(percent);
  return color(FILLED.repeat(filled), clr) + color(EMPTY.repeat(empty), dim);
}

/** bar 为空时不留下多余空格 */
function barSegment(label: string, bar: string, value: string): string {
  return bar ? `${label} ${bar} ${value}` : `${label} ${value}`;
}

/** Render the main session line: [Model] | Context bar | ⎇ branch */
export async function renderSessionLine(ctx: RenderContext): Promise<string> {
  const preset = ctx.presetConfig;
  const parts: string[] = [];

  // Model name
  if (preset.showModel) {
    const model = getModelName(ctx.stdin);
    parts.push(color(`[${model}]`, bold, cyan));
  }

  // Plan Mode 标识
  if (ctx.transcript.inPlanMode) {
    parts.push(color("[PLAN]", bold, yellow));
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
    const bar = renderBar(percent, barWidthFor(ctx.termWidth, 15, 10));
    const clr = contextColor(percent);
    const compactHint = percent >= 90 ? color(" ↯", clr) : "";
    parts.push(barSegment(color("Context", dim), bar, color(`${percent}%`, clr) + compactHint));
  }

  // Git branch (+ worktree 标识)
  const git = await getGitInfo(ctx.stdin.cwd);
  if (git.branch) {
    const wtMarker = git.isWorktree ? color(" [wt]", yellow) : "";
    parts.push(color(`⎇ ${git.branch}`, dim) + wtMarker);
  }

  // Skills count
  if (ctx.transcript.skills?.size > 0) {
    parts.push(color(`Skills x${ctx.transcript.skills.size}`, cyan));
  }

  // Output speed
  if (preset.showSpeed) {
    const speed = calcOutputSpeed(ctx.transcript);
    if (speed !== null) {
      parts.push(color(`⚡${formatSpeed(speed)}`, dim));
    }
  }

  return parts.join(color(" \u2502 ", gray)); // │ separator
}

/** Render rate limits line */
export function renderRateLimitsLine(ctx: RenderContext): string | null {
  const preset = ctx.presetConfig;
  if (!preset.showRateLimits) return null;

  const rl5h = getRateLimit5h(ctx.stdin);
  const rl7d = getRateLimit7d(ctx.stdin);
  if (!rl5h && !rl7d) return null;

  const barWidth = barWidthFor(ctx.termWidth, 10, 6);
  const parts: string[] = [];

  {
    const r = rl5h ?? { percent: 0, resetsAt: null };
    const bar = renderBar(r.percent, barWidth);
    const resetStr = r.resetsAt ? ` ↻${formatResetCountdown(r.resetsAt)}` : "";
    parts.push(barSegment(color("Current", dim), bar, `${r.percent}%${color(resetStr, gray)}`));
  }

  {
    const r = rl7d ?? { percent: 0, resetsAt: null };
    const bar = renderBar(r.percent, barWidth);
    const resetStr = r.resetsAt ? ` ↻${formatResetAbsolute(r.resetsAt)}` : "";
    parts.push(barSegment(color("All", dim), bar, `${r.percent}%${color(resetStr, gray)}`));
  }

  return parts.join(color(" │ ", gray));
}
