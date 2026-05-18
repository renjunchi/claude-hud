/** 将 mcp__<server>__<tool> 压缩为紧凑展示 server:tool；非 MCP 工具名原样返回 */
export function formatToolName(name: string): string {
  if (!name.startsWith("mcp__")) return name;
  const rest = name.slice("mcp__".length);
  const idx = rest.indexOf("__");
  if (idx < 0) return name;

  const serverRaw = rest.slice(0, idx);
  const toolRaw = rest.slice(idx + 2);

  // server 取最后一段（按 - 或 _ 切分），通常更具语义
  const serverTokens = serverRaw.split(/[-_]/).filter(Boolean);
  const server = serverTokens[serverTokens.length - 1] ?? serverRaw;

  // tool 去掉冗余的 _mcp 后缀
  const tool = toolRaw.replace(/_mcp$/, "");

  return `${server}:${tool}`;
}
