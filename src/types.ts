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
  /** 预计算好的输入摘要，已截断 —— 仅 running 工具显示 */
  summary?: string;
  /** Bash / Agent run_in_background:true 标记，渲染时单独成行 */
  background?: boolean;
}

export interface AgentEntry {
  id: string;
  type: string;
  description?: string;
  status: "running" | "completed";
}

/** 单次 session 内的 Task（TaskCreate / TaskUpdate 派生） */
export interface TaskEntry {
  /** Claude 分配的顺序 id，从 1 开始的字符串 */
  id: string;
  subject?: string;
  status: "pending" | "in_progress" | "completed" | "deleted";
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
  /** Unique skill names used in this session */
  skills: Set<string>;
  /** 按 TaskCreate 顺序排列的任务 */
  tasks: TaskEntry[];
  usage: TokenUsage;
  /** ISO timestamp of the first assistant message */
  firstAssistantTime?: string;
  /** ISO timestamp of the last assistant message */
  lastAssistantTime?: string;
  /** 最近一条 assistant 消息的输出 token 数 */
  lastOutputTokens?: number;
  /** 最近一条 assistant 消息的前一条 assistant 时间戳 */
  prevAssistantTime?: string;
}

/** 其他会话的运行状态 */
export type SessionState = "working" | "turn_complete" | "error";

/** 跨会话通知 */
export interface SessionNotification {
  sessionId: string;
  project: string;
  sessionName?: string;
  state: SessionState;
  /** 首次检测到此状态的时间戳(ms) */
  detectedAt: number;
  detail?: string;
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
  showSpeed: boolean;
  showNotifications: boolean;
  showTasks: boolean;
  showBackground: boolean;
}

export interface RenderContext {
  stdin: StdinData;
  transcript: TranscriptData;
  presetConfig: PresetConfig;
  termWidth: number;
}
