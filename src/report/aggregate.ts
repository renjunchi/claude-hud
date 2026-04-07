import { join } from "path";
import { homedir } from "os";

export interface DailyStats {
  date: string;
  inputTokens: number;
  outputTokens: number;
  sessions: number;
}

export interface SessionStats {
  sessionId: string;
  project: string;
  firstActivity: string;
  lastActivity: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProjectStats {
  project: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  lastActivity: string;
}

export interface ReportData {
  daily: DailyStats[];
  sessions: SessionStats[];
  projects: ProjectStats[];
  totals: { tokens: number; sessions: number; activeDays: number };
  modelBreakdown: Record<string, { tokens: number }>;
  generatedAt: string;
}

interface AssistantEntry {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

/** Extract project name from encoded directory name */
export function projectFromDir(dirName: string): string {
  const parts = dirName.replace(/^-/, "").split("-");
  return parts[parts.length - 1] || dirName;
}

/** Aggregate all transcript data into report format */
export async function aggregateReport(): Promise<ReportData> {
  const projectsDir = join(homedir(), ".claude", "projects");

  const glob = new Bun.Glob("*/*.jsonl");
  const files: { path: string; project: string }[] = [];

  for await (const match of glob.scan({ cwd: projectsDir, onlyFiles: true })) {
    if (match.includes("/subagents/")) continue;
    const dirName = match.split("/")[0];
    files.push({
      path: join(projectsDir, match),
      project: projectFromDir(dirName),
    });
  }

  const dailyMap = new Map<string, DailyStats>();
  const sessionMap = new Map<string, SessionStats>();
  const modelMap = new Map<string, { tokens: number }>();

  for (const file of files) {
    await parseFile(file.path, file.project, dailyMap, sessionMap, modelMap);
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = Array.from(sessionMap.values()).sort(
    (a, b) => b.lastActivity.localeCompare(a.lastActivity),
  );

  let totalTokens = 0;
  const projectMap = new Map<string, ProjectStats>();
  for (const s of sessions) {
    totalTokens += s.inputTokens + s.outputTokens;
    const p = projectMap.get(s.project) ?? { project: s.project, sessions: 0, inputTokens: 0, outputTokens: 0, lastActivity: "" };
    p.sessions++;
    p.inputTokens += s.inputTokens;
    p.outputTokens += s.outputTokens;
    if (s.lastActivity > p.lastActivity) p.lastActivity = s.lastActivity;
    projectMap.set(s.project, p);
  }
  const projects = Array.from(projectMap.values()).sort(
    (a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens),
  );

  return {
    daily,
    sessions,
    projects,
    totals: {
      tokens: totalTokens,
      sessions: sessions.length,
      activeDays: daily.length,
    },
    modelBreakdown: Object.fromEntries(modelMap),
    generatedAt: new Date().toISOString(),
  };
}

async function parseFile(
  filePath: string,
  project: string,
  dailyMap: Map<string, DailyStats>,
  sessionMap: Map<string, SessionStats>,
  modelMap: Map<string, { tokens: number }>,
): Promise<void> {
  let text: string;
  try {
    text = await Bun.file(filePath).text();
  } catch {
    return;
  }

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: AssistantEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "assistant" || !entry.message?.usage) continue;

    const u = entry.message.usage;
    const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const output = u.output_tokens ?? 0;
    const model = entry.message.model ?? "unknown";

    // Date key
    const ts = entry.timestamp ?? "";
    const date = ts.slice(0, 10);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const d = dailyMap.get(date) ?? { date, inputTokens: 0, outputTokens: 0, sessions: 0 };
      d.inputTokens += input;
      d.outputTokens += output;
      dailyMap.set(date, d);
    }

    // Session
    const sid = entry.sessionId ?? filePath;
    const s = sessionMap.get(sid) ?? {
      sessionId: sid,
      project,
      firstActivity: ts,
      lastActivity: ts,
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
    s.inputTokens += input;
    s.outputTokens += output;
    if (ts && ts < s.firstActivity) s.firstActivity = ts;
    if (ts && ts > s.lastActivity) s.lastActivity = ts;
    s.model = model;
    sessionMap.set(sid, s);

    // Model breakdown
    const tier = model.includes("opus") ? "Opus" : model.includes("haiku") ? "Haiku" : "Sonnet";
    const m = modelMap.get(tier) ?? { tokens: 0 };
    m.tokens += input + output;
    modelMap.set(tier, m);
  }

  // Count unique sessions per day
  const sessionsPerDay = new Map<string, Set<string>>();
  for (const [sid, s] of sessionMap) {
    const date = s.firstActivity.slice(0, 10);
    if (!date) continue;
    const set = sessionsPerDay.get(date) ?? new Set();
    set.add(sid);
    sessionsPerDay.set(date, set);
  }
  for (const [date, set] of sessionsPerDay) {
    const d = dailyMap.get(date);
    if (d) d.sessions = set.size;
  }
}
