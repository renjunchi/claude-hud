const MAX = 18;
const ELLIPSIS = "…"; // …

function trunc(s: string): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX ? oneLine.slice(0, MAX - 1) + ELLIPSIS : oneLine;
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/** 为 running 工具生成一个 18 字以内的输入摘要；无法总结时返回 undefined */
export function summarizeToolInput(
  name: string,
  input: unknown,
): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, unknown>;

  let raw: string;
  switch (name) {
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      raw = basename(String(i.file_path ?? i.notebook_path ?? i.path ?? ""));
      break;
    case "Grep":
    case "Glob":
      raw = String(i.pattern ?? "");
      break;
    case "Bash":
      // description 是人类友好版（如 "Run test suite"），优先于原始 command
      raw = String(i.description ?? i.command ?? "");
      break;
    case "WebFetch":
      raw = String(i.url ?? "");
      break;
    case "WebSearch":
      raw = String(i.query ?? "");
      break;
    case "Skill": {
      const full = String(i.skill ?? "");
      if (!full) return undefined;
      const colon = full.indexOf(":");
      raw = colon >= 0 ? full.slice(colon + 1) : full;
      break;
    }
    default:
      return undefined;
  }

  const out = trunc(raw);
  return out || undefined;
}
