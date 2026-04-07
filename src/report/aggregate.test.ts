import { describe, test, expect } from "bun:test";
import { projectFromDir } from "./aggregate";

describe("projectFromDir", () => {
  test("extracts last segment from encoded path", () => {
    expect(projectFromDir("-Users-foo-projects-my-app")).toBe("app");
  });

  test("handles simple name", () => {
    expect(projectFromDir("my-project")).toBe("project");
  });

  test("handles single segment with leading dash", () => {
    expect(projectFromDir("-app")).toBe("app");
  });
});
