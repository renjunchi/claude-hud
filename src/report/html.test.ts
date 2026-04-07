import { describe, test, expect } from "bun:test";
import { generateReportHTML } from "./html";
import type { ReportData } from "./aggregate";

function makeData(): ReportData {
  return {
    daily: [
      { date: "2026-04-06", inputTokens: 5000, outputTokens: 1000, sessions: 2 },
      { date: "2026-04-07", inputTokens: 10000, outputTokens: 2000, sessions: 3 },
    ],
    sessions: [
      { sessionId: "abc", project: "my-app", firstActivity: "2026-04-07T10:00:00Z", lastActivity: "2026-04-07T11:00:00Z", model: "claude-opus-4-6", inputTokens: 10000, outputTokens: 2000 },
    ],
    projects: [
      { project: "my-app", sessions: 1, inputTokens: 10000, outputTokens: 2000, lastActivity: "2026-04-07T11:00:00Z" },
    ],
    totals: { tokens: 18000, sessions: 1, activeDays: 2 },
    modelBreakdown: { Opus: { tokens: 18000 } },
    generatedAt: "2026-04-07T12:00:00Z",
  };
}

describe("generateReportHTML", () => {
  test("returns valid HTML", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  test("includes Chart.js (inline or CDN)", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain("Chart");
  });

  test("includes totals without cost", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain("18K");
    expect(html).not.toContain("Cost");
  });

  test("includes project summary table", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain("Projects");
    expect(html).toContain("my-app");
  });

  test("includes session data with input/output columns", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain("opus-4-6");
    expect(html).toContain("Input");
    expect(html).toContain("Output");
  });

  test("embeds DATA json", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain("const DATA =");
  });

  test("includes chart canvases", async () => {
    const html = await generateReportHTML(makeData());
    expect(html).toContain('id="tokenChart"');
    expect(html).toContain('id="modelChart"');
  });
});
