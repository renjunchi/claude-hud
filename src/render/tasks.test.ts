import { describe, test, expect } from "bun:test";
import { renderTasksLine } from "./tasks";
import { stripAnsi } from "./colors";
import type { TaskEntry } from "../types";

const t = (id: string, status: TaskEntry["status"]): TaskEntry => ({ id, status });

describe("renderTasksLine", () => {
  test("returns null for empty array", () => {
    expect(renderTasksLine([])).toBeNull();
  });

  test("returns null when all tasks are deleted", () => {
    const tasks = [t("1", "deleted"), t("2", "deleted")];
    expect(renderTasksLine(tasks)).toBeNull();
  });

  test("shows completed/total", () => {
    const tasks = [t("1", "completed"), t("2", "completed"), t("3", "pending")];
    const line = stripAnsi(renderTasksLine(tasks)!);
    expect(line).toBe("Tasks ✓2/3");
  });

  test("appends ↻N for in_progress > 0", () => {
    const tasks = [t("1", "completed"), t("2", "in_progress"), t("3", "pending")];
    const line = stripAnsi(renderTasksLine(tasks)!);
    expect(line).toBe("Tasks ✓1/3 ↻1");
  });

  test("excludes deleted from total", () => {
    const tasks = [t("1", "completed"), t("2", "deleted"), t("3", "pending")];
    const line = stripAnsi(renderTasksLine(tasks)!);
    expect(line).toBe("Tasks ✓1/2");
  });

  test("all completed renders ✓N/N without ↻ suffix", () => {
    const tasks = [t("1", "completed"), t("2", "completed")];
    const line = stripAnsi(renderTasksLine(tasks)!);
    expect(line).toBe("Tasks ✓2/2");
  });

  test("zero completed still renders ✓0/N", () => {
    const tasks = [t("1", "pending"), t("2", "in_progress")];
    const line = stripAnsi(renderTasksLine(tasks)!);
    expect(line).toBe("Tasks ✓0/2 ↻1");
  });
});
