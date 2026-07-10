const DEFAULT_TERM_WIDTH = 120;

/**
 * Claude Code 捕获 statusline 的 stdout/stderr（均为 pipe，无控制终端），
 * 因此只能从 COLUMNS 读取终端宽度 —— 它在每次调用前被写入（v2.1.153+）。
 * stderr/stdout.columns 仅为脱离 Claude Code 直接运行时的兜底。
 */
export function detectTermWidth(env: NodeJS.ProcessEnv = process.env): number {
  const cols = Number(env.COLUMNS);
  if (Number.isInteger(cols) && cols > 0) return cols;
  return process.stderr.columns || process.stdout.columns || DEFAULT_TERM_WIDTH;
}
