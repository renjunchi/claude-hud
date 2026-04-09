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
    showSpeed: true,
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
    showSpeed: true,
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
    showSpeed: false,
  },
};

/** Maps show-config keys to PresetConfig field names */
const SHOW_KEY_MAP: Record<string, keyof PresetConfig> = {
  model: "showModel",
  contextBar: "showContextBar",
  project: "showProject",
  rateLimits: "showRateLimits",
  tools: "showTools",
  agents: "showAgents",
  tokenUsage: "showTokenUsage",
  sessions: "showSessions",
  speed: "showSpeed",
};

const CUSTOM_BASE: PresetConfig = {
  showModel: false,
  showContextBar: false,
  showProject: false,
  showRateLimits: false,
  showTools: false,
  showAgents: false,
  showTokenUsage: false,
  showSessions: false,
  showSpeed: false,
};

function isValidPreset(value: string): value is Preset {
  return value === "full" || value === "essential" || value === "minimal";
}

export async function resolvePresetConfig(
  configPath?: string,
): Promise<PresetConfig> {
  // 1. Read config file
  let filePreset: string | undefined;
  let showOverrides: Record<string, unknown> | undefined;

  try {
    const path = configPath ?? join(homedir(), ".claude", "claude-hud.json");
    const file = Bun.file(path);
    if (await file.exists()) {
      const config = await file.json();
      filePreset =
        typeof config.preset === "string" ? config.preset : undefined;
      showOverrides =
        config.show && typeof config.show === "object" && !Array.isArray(config.show)
          ? config.show
          : undefined;
    }
  } catch {
    // Parse failure → fallback to default
    return { ...PRESETS.full };
  }

  // 2. Determine base PresetConfig
  const envPreset = process.env.CLAUDE_HUD_PRESET;
  let base: PresetConfig;

  if (envPreset) {
    if (isValidPreset(envPreset)) {
      base = { ...PRESETS[envPreset] };
    } else if (envPreset === "custom") {
      base = { ...CUSTOM_BASE };
    } else {
      base = { ...PRESETS.full };
    }
  } else if (filePreset) {
    if (isValidPreset(filePreset)) {
      base = { ...PRESETS[filePreset] };
    } else if (filePreset === "custom") {
      base = { ...CUSTOM_BASE };
    } else {
      base = { ...PRESETS.full };
    }
  } else if (showOverrides) {
    // Scenario D: 无 preset 但有 show → 基于 full preset 叠加覆盖（更符合用户直觉）
    base = { ...PRESETS.full };
  } else {
    base = { ...PRESETS.full };
  }

  // 3. Apply show overrides
  if (showOverrides) {
    for (const [key, value] of Object.entries(showOverrides)) {
      const mapped = SHOW_KEY_MAP[key];
      if (mapped) {
        if (typeof value === "boolean") {
          base[mapped] = value;
        }
      } else {
        console.error(`[claude-hud] Unknown show key: "${key}"`);
      }
    }
  }

  return base;
}

export { PRESETS, SHOW_KEY_MAP, CUSTOM_BASE };
