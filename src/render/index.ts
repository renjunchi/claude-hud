import type { RenderContext } from "../types";
import { renderSessionLine, renderRateLimitsLine } from "./context-bar";
import { renderToolsLine } from "./tools";
import { renderAgentsLine } from "./agents";
import { renderTokenUsageLine } from "./token-usage";
import { renderSessionsLine } from "./sessions";
import { scanActiveSessions } from "../sessions";

/** Render all lines based on preset */
export async function render(ctx: RenderContext): Promise<string> {
  const preset = ctx.presetConfig;
  const lines: string[] = [];

  // Line 1: always — model + project + context bar + git branch
  lines.push(await renderSessionLine(ctx));

  // Line 2: rate limits
  if (preset.showRateLimits) {
    const rateLine = renderRateLimitsLine(ctx);
    if (rateLine) lines.push(rateLine);
  }

  // Line 3: token usage
  if (preset.showTokenUsage) {
    const usageLine = renderTokenUsageLine(ctx.transcript.usage, ctx.transcript);
    if (usageLine) lines.push(usageLine);
  }

  // Line 4: other active sessions
  if (preset.showSessions) {
    const sessions = await scanActiveSessions(ctx.stdin.transcript_path);
    const sessionsLine = renderSessionsLine(sessions);
    if (sessionsLine) lines.push(sessionsLine);
  }

  // Line 5: active tools
  if (preset.showTools) {
    const toolsLine = renderToolsLine(ctx.transcript.tools);
    if (toolsLine) lines.push(toolsLine);
  }

  // Line 6: agents
  if (preset.showAgents) {
    const agentsLine = renderAgentsLine(ctx.transcript.agents);
    if (agentsLine) lines.push(agentsLine);
  }

  return lines.join("\n");
}
