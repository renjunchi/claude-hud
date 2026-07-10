import { readStdin } from "./stdin";
import { parseTranscript } from "./transcript";
import { resolvePresetConfig } from "./presets";
import { render } from "./render/index";
import { setup, disable } from "./cli/setup";
import { report } from "./cli/report";
import { ensureWatcher } from "./watcher";
import { detectTermWidth } from "./term-width";
import type { PresetConfig, RenderContext, StdinData } from "./types";

/** Statusline 热路径核心：transcript 解析 + render。无 stdin/stdout 副作用，便于性能基准测试。 */
export async function resolveAndRender(
  stdin: StdinData,
  presetConfig: PresetConfig,
  termWidth: number,
): Promise<string> {
  const transcript = await parseTranscript(stdin.transcript_path);
  const ctx: RenderContext = { stdin, transcript, presetConfig, termWidth };
  return await render(ctx);
}

async function main(): Promise<void> {
  // CLI subcommands
  const arg = process.argv[2];
  if (arg === "setup" || arg === "enable") {
    await setup();
    return;
  }
  if (arg === "disable") {
    await disable();
    return;
  }
  if (arg === "report") {
    await report(process.argv.slice(3));
    return;
  }
  if (arg === "watch") {
    if (process.argv[3] === "--daemon") {
      const { runDaemon } = await import("./watcher");
      await runDaemon();
    } else {
      const { watch } = await import("./cli/watch");
      await watch(process.argv.slice(3));
    }
    return;
  }

  // 先解析 preset，决定是否需要后台 watcher（避免关 UI 不等于关行为）
  const presetConfig = await resolvePresetConfig();

  // 仅在用户开启跨会话通知时才拉起 watcher daemon
  if (presetConfig.showNotifications) {
    ensureWatcher();
  }

  // Read stdin JSON from Claude Code
  const stdin = await readStdin();

  const termWidth = detectTermWidth();

  const output = await resolveAndRender(stdin, presetConfig, termWidth);
  console.log(output);
}

main().catch((err) => {
  // Log to stderr so it doesn't interfere with stdout (which Claude Code reads)
  console.error(`[cli-hud] ${err?.message ?? err}`);
});
