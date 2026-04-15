import { join, resolve } from "path";
import { homedir } from "os";

export async function disable(): Promise<void> {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const file = Bun.file(settingsPath);

  let settings: Record<string, unknown> = {};
  try {
    if (await file.exists()) {
      settings = await file.json();
    }
  } catch {
    // ignore
  }

  if (!settings.statusLine) {
    console.log("cli-hud is not configured.");
    return;
  }

  delete settings.statusLine;
  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  console.log("cli-hud disabled. Restart Claude Code to restore native statusline.");
}

export async function setup(): Promise<void> {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const file = Bun.file(settingsPath);

  // Read existing settings
  let settings: Record<string, unknown> = {};
  try {
    if (await file.exists()) {
      settings = await file.json();
    }
  } catch {
    // Start fresh if unreadable
  }

  // Check if already configured with OUR version
  const existing = settings.statusLine as Record<string, unknown> | undefined;
  const existingCmd = existing?.command ? String(existing.command) : "";
  if (existingCmd.includes("cli-hud")) {
    console.log("cli-hud is already configured.");
    console.log(`  command: ${existingCmd}`);
    return;
  }

  if (existingCmd) {
    console.log(`Replacing existing statusLine command:`);
    console.log(`  old: ${existingCmd.slice(0, 80)}...`);
  }

  // Determine command — use the script path for local dev, or "cli-hud" for global install
  const command = resolveCommand();

  // Write settings
  settings.statusLine = {
    type: "command",
    command,
  };

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  console.log(`Configured statusline in ${settingsPath}`);
  console.log(`  command: ${command}`);
  console.log("");
  console.log("Restart Claude Code to see the HUD.");
  console.log("");
  console.log("Tip: 运行 \"cli-hud watch\" 启用后台通知（空闲时也能收到其他会话的状态提醒）");
}

function resolveCommand(): string {
  const mainPath = process.argv[1];
  if (mainPath && (mainPath.endsWith(".ts") || mainPath.includes("src/index.ts") || mainPath.includes("src\\index.ts"))) {
    const absPath = resolve(mainPath);
    return `bun ${absPath}`;
  }

  // Otherwise assume global install
  return "cli-hud";
}
