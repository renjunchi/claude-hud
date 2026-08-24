import { parseCodexRollout } from "../adapters/codex";
import { render } from "../render/index";
import type { PresetConfig, RenderContext } from "../types";

export interface CodexCliArgs {
  transcriptPath: string;
}

export function parseCodexArgs(args: string[]): CodexCliArgs {
  const equalsArg = args.find((arg) => arg.startsWith("--transcript="));
  const equalsPath = equalsArg?.slice("--transcript=".length);
  const flagIndex = args.indexOf("--transcript");
  const flagPath = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
  const transcriptPath = equalsPath || flagPath;
  if (!transcriptPath || transcriptPath.startsWith("--")) {
    throw new Error("Usage: cli-hud codex --transcript <rollout.jsonl>");
  }
  return { transcriptPath };
}

/** Render one Codex rollout snapshot without invoking Claude-only session scanners. */
export async function renderCodexSnapshot(
  transcriptPath: string,
  presetConfig: PresetConfig,
  termWidth: number,
): Promise<string> {
  const adapted = await parseCodexRollout(transcriptPath);
  const codexPreset: PresetConfig = {
    ...presetConfig,
    showSessions: false,
    showNotifications: false,
  };
  const ctx: RenderContext = {
    ...adapted,
    presetConfig: codexPreset,
    termWidth,
  };
  return await render(ctx);
}
