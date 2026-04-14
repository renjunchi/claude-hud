import { join } from "path";
import { homedir } from "os";
import { aggregateReport } from "../report/aggregate";
import { generateReportHTML } from "../report/html";

const REPORT_PATH = join(homedir(), ".claude", "cli-hud-report.html");

export async function report(args: string[]): Promise<void> {
  const noOpen = args.includes("--no-open");

  console.log("Scanning transcripts...");
  const data = await aggregateReport();
  console.log(`Found ${data.totals.sessions} sessions, ${data.totals.activeDays} active days`);

  const html = await generateReportHTML(data);
  await Bun.write(REPORT_PATH, html);
  console.log(`Report saved to ${REPORT_PATH}`);

  if (!noOpen) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    Bun.spawn([cmd, REPORT_PATH]);
  }
}
