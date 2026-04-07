import type { Preset, PresetConfig } from "./types";
import { join } from "path";
import { homedir } from "os";

const PRESETS: Record<Preset, PresetConfig> = {
  full: {
    showModel: true,
    showContextBar: true,
    showProject: false,
    showRateLimits: true,
    showTools: false,
    showAgents: false,
    showTokenUsage: false,
    showSessions: true,
  },
  essential: {
    showModel: true,
    showContextBar: true,
    showProject: true,
    showRateLimits: true,
    showTools: false,
    showAgents: false,
    showTokenUsage: true,
    showSessions: true,
  },
  minimal: {
    showModel: true,
    showContextBar: true,
    showProject: false,
    showRateLimits: false,
    showTools: false,
    showAgents: false,
    showTokenUsage: false,
    showSessions: false,
  },
};

function isValidPreset(value: string): value is Preset {
  return value === "full" || value === "essential" || value === "minimal";
}

export async function resolvePresetName(): Promise<Preset> {
  // 1. Environment variable
  const env = process.env.CLAUDE_HUD_PRESET;
  if (env && isValidPreset(env)) return env;

  // 2. Config file
  try {
    const configPath = join(homedir(), ".claude", "claude-hud.json");
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const config = await file.json();
      if (config.preset && isValidPreset(config.preset)) return config.preset;
    }
  } catch {
    // ignore
  }

  // 3. Default
  return "full";
}

export { PRESETS };
