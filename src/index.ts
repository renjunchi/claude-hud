import { readStdin } from "./stdin";
import { parseTranscript } from "./transcript";
import { resolvePresetName } from "./presets";
import { render } from "./render/index";
import { setup, disable } from "./cli/setup";
import { report } from "./cli/report";
import type { RenderContext } from "./types";

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

  // Read stdin JSON from Claude Code
  const stdin = await readStdin();

  // Parse transcript for tools/agents data
  const transcript = await parseTranscript(stdin.transcript_path);

  // Resolve display preset
  const preset = await resolvePresetName();

  // Detect terminal width (stderr since stdout is piped)
  const termWidth = process.stderr.columns || process.stdout.columns || 120;

  // Build render context
  const ctx: RenderContext = { stdin, transcript, preset, termWidth };

  // Render and output
  const output = await render(ctx);
  console.log(output);
}

main().catch(() => {
  // Silent failure — don't break Claude Code's terminal
});
