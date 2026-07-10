import { describe, test, expect } from "bun:test";
import { detectTermWidth } from "./term-width";

describe("detectTermWidth", () => {
  test("读取 Claude Code 注入的 COLUMNS", () => {
    expect(detectTermWidth({ COLUMNS: "58" })).toBe(58);
  });

  test("无 COLUMNS 时回落到默认宽度（statusline 下 stdout/stderr 均非 TTY）", () => {
    expect(detectTermWidth({})).toBe(process.stderr.columns || process.stdout.columns || 120);
  });

  test("忽略非法 COLUMNS", () => {
    for (const bad of ["", "0", "-5", "abc", "80.5"]) {
      expect(detectTermWidth({ COLUMNS: bad })).not.toBe(Number(bad));
    }
  });
});
