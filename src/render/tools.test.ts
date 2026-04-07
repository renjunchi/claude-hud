import { describe, test, expect } from "bun:test";
import { renderToolsLine } from "./tools";
import { stripAnsi } from "./colors";
import type { ToolEntry } from "../types";

describe("renderToolsLine", () => {
  test("returns null for empty array", () => {
    expect(renderToolsLine([])).toBeNull();
  });

  test("shows running tool with spinner", () => {
    const tools: ToolEntry[] = [{ id: "1", name: "Read", status: "running" }];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).toContain("◐");
    expect(line).toContain("Read");
  });

  test("shows completed tool with check", () => {
    const tools: ToolEntry[] = [{ id: "1", name: "Grep", status: "completed" }];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).toContain("✓");
    expect(line).toContain("Grep");
  });

  test("shows error tool with cross", () => {
    const tools: ToolEntry[] = [{ id: "1", name: "Bash", status: "error" }];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).toContain("✗");
    expect(line).toContain("Bash");
  });

  test("groups completed tools with count", () => {
    const tools: ToolEntry[] = [
      { id: "1", name: "Read", status: "completed" },
      { id: "2", name: "Read", status: "completed" },
      { id: "3", name: "Read", status: "completed" },
    ];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).toContain("Read x3");
  });

  test("does not show count for single completed tool", () => {
    const tools: ToolEntry[] = [{ id: "1", name: "Read", status: "completed" }];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).not.toContain("x1");
  });

  test("running tools appear before completed", () => {
    const tools: ToolEntry[] = [
      { id: "1", name: "Grep", status: "completed" },
      { id: "2", name: "Read", status: "running" },
    ];
    const line = stripAnsi(renderToolsLine(tools)!);
    const runIdx = line.indexOf("Read");
    const doneIdx = line.indexOf("Grep");
    expect(runIdx).toBeLessThan(doneIdx);
  });
});
