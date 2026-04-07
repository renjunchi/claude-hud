import { describe, test, expect } from "bun:test";
import { renderAgentsLine } from "./agents";
import { stripAnsi } from "./colors";
import type { AgentEntry } from "../types";

describe("renderAgentsLine", () => {
  test("returns null for empty array", () => {
    expect(renderAgentsLine([])).toBeNull();
  });

  test("shows running agent with spinner and type", () => {
    const agents: AgentEntry[] = [{ id: "1", type: "Explore", status: "running" }];
    const line = stripAnsi(renderAgentsLine(agents)!);
    expect(line).toContain("◐");
    expect(line).toContain("Explore");
  });

  test("shows running agent description", () => {
    const agents: AgentEntry[] = [{ id: "1", type: "Explore", description: "search files", status: "running" }];
    const line = stripAnsi(renderAgentsLine(agents)!);
    expect(line).toContain("Explore: search files");
  });

  test("shows completed agent count", () => {
    const agents: AgentEntry[] = [
      { id: "1", type: "Explore", status: "completed" },
      { id: "2", type: "Plan", status: "completed" },
    ];
    const line = stripAnsi(renderAgentsLine(agents)!);
    expect(line).toContain("✓");
    expect(line).toContain("2 agents done");
  });

  test("singular 'agent' for one completed", () => {
    const agents: AgentEntry[] = [{ id: "1", type: "Explore", status: "completed" }];
    const line = stripAnsi(renderAgentsLine(agents)!);
    expect(line).toContain("1 agent done");
    expect(line).not.toContain("agents");
  });

  test("shows both running and completed", () => {
    const agents: AgentEntry[] = [
      { id: "1", type: "Explore", status: "running" },
      { id: "2", type: "Plan", status: "completed" },
    ];
    const line = stripAnsi(renderAgentsLine(agents)!);
    expect(line).toContain("Explore");
    expect(line).toContain("1 agent done");
  });
});
