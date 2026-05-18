import { describe, test, expect } from "bun:test";
import { summarizeToolInput } from "./tool-summary";

describe("summarizeToolInput", () => {
  test("Read: basename + 截断", () => {
    const out = summarizeToolInput("Read", {
      file_path: "/a/b/Controller_Interface_Impl.ts",
    });
    expect(out).toBe("Controller_Interf…");
    expect(out!.length).toBe(18);
  });

  test("Read: 短文件名不截断", () => {
    expect(summarizeToolInput("Read", { file_path: "/x/foo.ts" })).toBe("foo.ts");
  });

  test("Edit / Write: 同样取 basename", () => {
    expect(summarizeToolInput("Edit", { file_path: "/x/a.ts" })).toBe("a.ts");
    expect(summarizeToolInput("Write", { file_path: "/x/a.ts" })).toBe("a.ts");
  });

  test("Grep: 直接取 pattern", () => {
    expect(summarizeToolInput("Grep", { pattern: "abc" })).toBe("abc");
  });

  test("Bash: 折叠多行为单行", () => {
    expect(summarizeToolInput("Bash", { command: "ls\n-la" })).toBe("ls -la");
  });

  test("Bash: description 优先于 command", () => {
    expect(
      summarizeToolInput("Bash", {
        command: "find . -name '*.ts' | xargs grep foo",
        description: "Search foo",
      }),
    ).toBe("Search foo");
  });

  test("Bash: 无 description 时回落 command", () => {
    expect(summarizeToolInput("Bash", { command: "ls -la" })).toBe("ls -la");
  });

  test("未知工具返回 undefined", () => {
    expect(summarizeToolInput("TodoWrite", { todos: [] })).toBeUndefined();
    expect(summarizeToolInput("Unknown", { x: 1 })).toBeUndefined();
  });

  test("Skill: 显示 skill 名（去掉 plugin 前缀）", () => {
    expect(summarizeToolInput("Skill", { skill: "ad:ad-2-auto-issue" })).toBe(
      "ad-2-auto-issue",
    );
    expect(summarizeToolInput("Skill", { skill: "report" })).toBe("report");
  });

  test("Skill: 长 skill 名截断", () => {
    const out = summarizeToolInput("Skill", {
      skill: "ad:ad-harness-failure-handling",
    });
    expect(out!.length).toBeLessThanOrEqual(18);
  });

  test("Skill: 缺少 skill 字段返回 undefined", () => {
    expect(summarizeToolInput("Skill", {})).toBeUndefined();
  });

  test("空输入返回 undefined", () => {
    expect(summarizeToolInput("Read", null)).toBeUndefined();
    expect(summarizeToolInput("Read", {})).toBeUndefined();
    expect(summarizeToolInput("Read", { file_path: "" })).toBeUndefined();
  });

  test("WebFetch / WebSearch", () => {
    expect(summarizeToolInput("WebFetch", { url: "https://x.com" })).toBe("https://x.com");
    expect(summarizeToolInput("WebSearch", { query: "hi" })).toBe("hi");
  });
});
