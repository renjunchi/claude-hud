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

/** Claude Code 内置命令，非 skill，不计入排行 */
const BUILTIN_COMMANDS = new Set([
  "usage", "config", "init", "mcp", "skills", "plugin",
  "reload-plugins", "help", "clear", "compact", "cost",
  "doctor", "login", "logout", "status", "review",
]);

interface TranscriptEntry {
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
    content?: ContentBlock[] | string;
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
  // 归一化 skill 名称：将短名（如 "report"）合并到全限定名（如 "claude-hud:report"）
  // 先收集所有全限定名，建立 shortName → qualifiedName 映射
  const allNames = new Set<string>();
  for (const skills of projectSkillMap.values()) {
    for (const name of skills.keys()) allNames.add(name);
  }
  const shortToQualified = new Map<string, string>();
  for (const name of allNames) {
    if (name.includes(":")) {
      const shortName = name.split(":").pop()!;
      // 仅当短名也独立存在时才建立映射
      if (allNames.has(shortName)) {
        shortToQualified.set(shortName, name);
      }
    }
  }

  // Compute top 5 skills per project and global skill ranking
  const globalSkillMap = new Map<string, number>();
  for (const [proj, skills] of projectSkillMap) {
    const p = projectMap.get(proj);
    // Accumulate global counts（归一化名称）
    for (const [name, count] of skills) {
      const normalized = shortToQualified.get(name) ?? name;
      globalSkillMap.set(normalized, (globalSkillMap.get(normalized) ?? 0) + count);
    }
    if (!p || skills.size === 0) continue;
    const sorted = Array.from(skills.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    p.topSkills = sorted.map(([name, count]) => {
      const normalized = shortToQualified.get(name) ?? name;
      return count > 1 ? `${normalized} (x${count})` : normalized;
    });
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

  // 两类 skill 调用来源，需去重
  const commandNameSkills = new Set<string>(); // <command-name> 标签（用户 slash command）
  const fileSkills: string[] = [];              // 最终计入的 skill（来自 command-name）
  const toolUseSkills: string[] = [];           // Skill tool_use（assistant 调用）

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // 收集 skill 使用数据，稍后统一去重写入
    if (entry.type === "user" && typeof entry.message?.content === "string") {
      const match = entry.message.content.match(/<command-name>\/([^<]+)<\/command-name>/);
      if (match && !BUILTIN_COMMANDS.has(match[1])) {
        commandNameSkills.add(match[1]);
        fileSkills.push(match[1]);
      }
    }
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === "tool_use" && block.name === "Skill" && block.input?.skill) {
          toolUseSkills.push(block.input.skill as string);
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

  // 归一化 tool_use skill 到短名并去重（同一次调用可能同时产生全限定名和短名）
  const seenToolSkills = new Set<string>();
  const dedupedToolUseSkills: string[] = [];
  for (const name of toolUseSkills) {
    const shortName = name.includes(":") ? name.split(":").pop()! : name;
    if (!seenToolSkills.has(shortName)) {
      seenToolSkills.add(shortName);
      dedupedToolUseSkills.push(shortName);
    }
  }

  // Skill tool_use 去重：仅计入没有对应 <command-name> 的调用
  for (const name of dedupedToolUseSkills) {
    // 跳过已被 <command-name> 覆盖的（精确匹配或后缀匹配，如 "report" 匹配 "claude-hud:report"）
    if (commandNameSkills.has(name)) continue;
    let covered = false;
    for (const cmd of commandNameSkills) {
      if (name.endsWith(":" + cmd)) { covered = true; break; }
    }
    if (!covered) fileSkills.push(name);
  }

  // 写入 projectSkillMap
  if (fileSkills.length > 0) {
    const skills = projectSkillMap.get(project) ?? new Map<string, number>();
    for (const name of fileSkills) {
      skills.set(name, (skills.get(name) ?? 0) + 1);
    }
    projectSkillMap.set(project, skills);
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
