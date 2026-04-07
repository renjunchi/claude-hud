import { describe, test, expect } from "bun:test";
import { color, contextColor, stripAnsi, reset, bold, dim, green, yellow, red, cyan } from "./colors";

describe("color", () => {
  test("wraps text with single code and reset", () => {
    expect(color("hello", green)).toBe(`${green}hello${reset}`);
  });

  test("combines multiple codes", () => {
    expect(color("hello", bold, cyan)).toBe(`${bold}${cyan}hello${reset}`);
  });

  test("handles empty codes", () => {
    expect(color("hello")).toBe(`hello${reset}`);
  });
});

describe("contextColor", () => {
  test("returns green for ≤70%", () => {
    expect(contextColor(0)).toBe(green);
    expect(contextColor(50)).toBe(green);
    expect(contextColor(70)).toBe(green);
  });

  test("returns yellow for 71-90%", () => {
    expect(contextColor(71)).toBe(yellow);
    expect(contextColor(80)).toBe(yellow);
    expect(contextColor(90)).toBe(yellow);
  });

  test("returns red for >90%", () => {
    expect(contextColor(91)).toBe(red);
    expect(contextColor(100)).toBe(red);
  });
});

describe("stripAnsi", () => {
  test("removes ANSI codes", () => {
    const colored = color("hello", green);
    expect(stripAnsi(colored)).toBe("hello");
  });

  test("handles text without ANSI codes", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });

  test("removes multiple ANSI codes", () => {
    const text = color("a", bold, cyan) + color("b", red);
    expect(stripAnsi(text)).toBe("ab");
  });
});
