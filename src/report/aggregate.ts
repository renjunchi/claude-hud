import { join } from "path";
import { homedir } from "os";

export interface DailyStats {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
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
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ProjectStats {
  project: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  lastActivity: string;
  topSkills: string[];
}

export interface ReportData {
  daily: DailyStats[];
  sessions: SessionStats[];
  projects: ProjectStats[];
  totals: {
    tokens: number;
    sessions: number;
    activeDays: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;

  };
  modelBreakdown: Record<string, { tokens: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }>;
  skillRanking: { name: string; count: number }[];
  generatedAt: string;
}

interface ContentBlock {
  type?: string;
  name?: string;
  input?: Record<string, unknown>;
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
    content?: ContentBlock[];
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
  const modelMap = new Map<string, { tokens: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }>();
  const projectSkillMap = new Map<string, Map<string, number>>();

  for (const file of files) {
    await parseFile(file.path, file.project, dailyMap, sessionMap, modelMap, projectSkillMap);
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = Array.from(sessionMap.values()).sort(
    (a, b) => b.lastActivity.localeCompare(a.lastActivity),
  );

  let totalTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  const projectMap = new Map<string, ProjectStats>();
  for (const s of sessions) {
    totalTokens += s.inputTokens + s.outputTokens;
    totalCacheCreation += s.cacheCreationTokens;
    totalCacheRead += s.cacheReadTokens;
    const p = projectMap.get(s.project) ?? { project: s.project, sessions: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, lastActivity: "", topSkills: [] as string[] };
    p.sessions++;
    p.inputTokens += s.inputTokens;
    p.outputTokens += s.outputTokens;
    p.cacheCreationTokens += s.cacheCreationTokens;
    p.cacheReadTokens += s.cacheReadTokens;
    if (s.lastActivity > p.lastActivity) p.lastActivity = s.lastActivity;
    projectMap.set(s.project, p);
  }
  // Compute top 5 skills per project and global skill ranking
  const globalSkillMap = new Map<string, number>();
  for (const [proj, skills] of projectSkillMap) {
    const p = projectMap.get(proj);
    // Accumulate global counts
    for (const [name, count] of skills) {
      globalSkillMap.set(name, (globalSkillMap.get(name) ?? 0) + count);
    }
    if (!p || skills.size === 0) continue;
    const sorted = Array.from(skills.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    p.topSkills = sorted.map(([name, count]) => count > 1 ? `${name} (x${count})` : name);
  }
  const skillRanking = Array.from(globalSkillMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

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
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
    },
    modelBreakdown: Object.fromEntries(modelMap),
    skillRanking,
    generatedAt: new Date().toISOString(),
  };
}

async function parseFile(
  filePath: string,
  project: string,
  dailyMap: Map<string, DailyStats>,
  sessionMap: Map<string, SessionStats>,
  modelMap: Map<string, { tokens: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }>,
  projectSkillMap: Map<string, Map<string, number>>,
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

    // Extract Skill usage from assistant content blocks
    if (entry.type === "assistant" && entry.message?.content) {
      for (const block of entry.message.content) {
        if (block.type === "tool_use" && block.name === "Skill" && block.input?.skill) {
          const skillName = block.input.skill as string;
          const skills = projectSkillMap.get(project) ?? new Map<string, number>();
          skills.set(skillName, (skills.get(skillName) ?? 0) + 1);
          projectSkillMap.set(project, skills);
        }
      }
    }

    if (entry.type !== "assistant" || !entry.message?.usage) continue;

    const u = entry.message.usage;
    const cacheCreation = u.cache_creation_input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const input = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const model = entry.message.model ?? "unknown";

    // Date key
    const ts = entry.timestamp ?? "";
    const date = ts.slice(0, 10);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const d = dailyMap.get(date) ?? { date, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, sessions: 0 };
      d.inputTokens += input;
      d.outputTokens += output;
      d.cacheCreationTokens += cacheCreation;
      d.cacheReadTokens += cacheRead;
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
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    s.inputTokens += input;
    s.outputTokens += output;
    s.cacheCreationTokens += cacheCreation;
    s.cacheReadTokens += cacheRead;
    if (ts && ts < s.firstActivity) s.firstActivity = ts;
    if (ts && ts > s.lastActivity) s.lastActivity = ts;
    s.model = model;
    sessionMap.set(sid, s);

    // Model breakdown
    const tier = model.includes("opus") ? "Opus" : model.includes("haiku") ? "Haiku" : model.includes("sonnet") ? "Sonnet" : "Other";
    const m = modelMap.get(tier) ?? { tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    m.tokens += input + output;
    m.inputTokens += input;
    m.outputTokens += output;
    m.cacheReadTokens += cacheRead;
    m.cacheCreationTokens += cacheCreation;
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
