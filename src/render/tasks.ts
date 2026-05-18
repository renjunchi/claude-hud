import type { TaskEntry } from "../types";
import { color, green, yellow, dim } from "./colors";

const CHECK = "✓";
const SPIN = "↻";

/**
 * 渲染 Tasks 行：`Tasks ✓2/5 ↻1`
 * - 不计入 deleted
 * - 全部 0 则返回 null
 * - in_progress 计数为 0 时省略 `↻N`
 * - 全部完成时数字部分显示为绿色，否则为黄色
 */
export function renderTasksLine(tasks: TaskEntry[]): string | null {
  if (tasks.length === 0) return null;

  let total = 0;
  let completed = 0;
  let inProgress = 0;

  for (const t of tasks) {
    if (t.status === "deleted") continue;
    total += 1;
    if (t.status === "completed") completed += 1;
    else if (t.status === "in_progress") inProgress += 1;
  }

  if (total === 0) return null;

  const allDone = completed === total;
  const statColor = allDone ? green : yellow;

  let stat = `${CHECK}${completed}/${total}`;
  if (inProgress > 0) stat += ` ${SPIN}${inProgress}`;

  return `${color("Tasks", dim)} ${color(stat, statColor)}`;
}
