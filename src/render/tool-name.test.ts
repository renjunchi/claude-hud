import { describe, test, expect } from "bun:test";
import { formatToolName } from "./tool-name";

describe("formatToolName", () => {
  test("非 MCP 工具名原样返回", () => {
    expect(formatToolName("Read")).toBe("Read");
    expect(formatToolName("Bash")).toBe("Bash");
    expect(formatToolName("Skill")).toBe("Skill");
  });

  test("mcp__server__tool 压缩为 server:tool", () => {
    expect(formatToolName("mcp__claude-in-chrome__tabs_create_mcp")).toBe(
      "chrome:tabs_create",
    );
    expect(formatToolName("mcp__claude_ai_Google_Drive__authenticate")).toBe(
      "Drive:authenticate",
    );
  });

  test("server 取最后一段（按 - 或 _ 切分）", () => {
    expect(formatToolName("mcp__foo-bar-baz__do_thing")).toBe("baz:do_thing");
    expect(formatToolName("mcp__a_b_c__x")).toBe("c:x");
  });

  test("tool 名末尾 _mcp 被剥除", () => {
    expect(formatToolName("mcp__x__y_mcp")).toBe("x:y");
  });

  test("tool 中间含 __ 时合并为单个名（取首段后剩余整体作 tool）", () => {
    // 仅切第一个 __ 分隔符，剩下的当作工具名
    expect(formatToolName("mcp__chrome__a__b")).toBe("chrome:a__b");
  });

  test("格式不合规的 mcp__ 前缀不抛错，原样返回", () => {
    expect(formatToolName("mcp__nosep")).toBe("mcp__nosep");
  });

  test("server 段单一无分隔符时保留", () => {
    expect(formatToolName("mcp__server__tool")).toBe("server:tool");
  });
});
