/** Raw JSON from Claude Code stdin */
export interface StdinData {
  transcript_path?: string;
  cwd?: string;
  model?: {
    id?: string;
    display_name?: string;
  };
  context_window?: {
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
    used_percentage?: number | null;
    remaining_percentage?: number | null;
  };
  rate_limits?: {
    five_hour?: {
      used_percentage?: number | null;
      resets_at?: number | null;
    } | null;
    seven_day?: {
      used_percentage?: number | null;
      resets_at?: number | null;
    } | null;
  } | null;
}

export interface ToolEntry {
  id: string;
  name: string;
  status: "running" | "completed" | "error";
}

export interface AgentEntry {
  id: string;
  type: string;
  description?: string;
  status: "running" | "completed";
}

export interface TokenUsage {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  model: string;
}

export interface TranscriptData {
  tools: ToolEntry[];
  agents: AgentEntry[];
  usage: TokenUsage;
}

export type Preset = "full" | "essential" | "minimal";

export interface PresetConfig {
  showModel: boolean;
  showContextBar: boolean;
  showProject: boolean;
  showRateLimits: boolean;
  showTools: boolean;
  showAgents: boolean;
  showTokenUsage: boolean;
  showSessions: boolean;
}

export interface RenderContext {
  stdin: StdinData;
  transcript: TranscriptData;
  preset: Preset;
  termWidth: number;
}
