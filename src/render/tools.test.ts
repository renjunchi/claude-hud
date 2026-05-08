import { describe, test, expect } from "bun:test";
import { renderToolsLine, SPINNER_FRAMES } from "./tools";
import { stripAnsi } from "./colors";
import type { ToolEntry } from "../types";

describe("renderToolsLine", () => {
  test("returns null for empty array", () => {
    expect(renderToolsLine([])).toBeNull();
  });

  test("shows running tool with Braille spinner", () => {
    const tools: ToolEntry[] = [{ id: "1", name: "Read", status: "running" }];
    const line = stripAnsi(renderToolsLine(tools)!);
    // 任何一帧都可接受（时间戳动态选帧）
    const hasFrame = SPINNER_FRAMES.some((f) => line.includes(f));
    expect(hasFrame).toBe(true);
    expect(line).toContain("Read");
  });

  test("running tool 带 summary 时拼成 'Name: summary'", () => {
    const tools: ToolEntry[] = [
      { id: "1", name: "Read", status: "running", summary: "foo.ts" },
    ];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).toContain("Read: foo.ts");
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

  test("completed tools 聚合计数用乘号 ×N", () => {
    const tools: ToolEntry[] = [
      { id: "1", name: "Read", status: "completed" },
      { id: "2", name: "Read", status: "completed" },
      { id: "3", name: "Read", status: "completed" },
    ];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).toContain("Read ×3");
    expect(line).not.toContain("Read x3");
  });

  test("does not show count for single completed tool", () => {
    const tools: ToolEntry[] = [{ id: "1", name: "Read", status: "completed" }];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).not.toContain("×1");
  });

  test("completed 即使带 summary 也不显示 summary", () => {
    const tools: ToolEntry[] = [
      { id: "1", name: "Read", status: "completed", summary: "foo.ts" },
    ];
    const line = stripAnsi(renderToolsLine(tools)!);
    expect(line).not.toContain("foo.ts");
    expect(line).toContain("Read");
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
