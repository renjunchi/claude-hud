import type { ReportData } from "./aggregate";
import { formatTokenCount } from "../render/token-usage";

const CHARTJS_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4";
let chartJsInline: string | null = null;

async function getChartJs(): Promise<string> {
  if (chartJsInline) return chartJsInline;
  try {
    const res = await fetch(CHARTJS_CDN);
    if (res.ok) {
      chartJsInline = await res.text();
      return chartJsInline;
    }
  } catch {
    // fallback to CDN
  }
  return "";
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function generateReportHTML(data: ReportData): Promise<string> {
  const chartJs = await getChartJs();
  const projectRows = data.projects.map((p) => `
    <tr>
      <td>${p.project}</td>
      <td>${p.sessions}</td>
      <td>${formatTokenCount(p.inputTokens)}</td>
      <td>${formatTokenCount(p.outputTokens)}</td>
      <td>${formatDate(p.lastActivity)}</td>
    </tr>`).join("");

  const sessionsRows = data.sessions.slice(0, 100).map((s) => `
    <tr>
      <td>${s.project}</td>
      <td>${formatDate(s.lastActivity)}</td>
      <td>${s.model.replace("claude-", "")}</td>
      <td>${formatTokenCount(s.inputTokens)}</td>
      <td>${formatTokenCount(s.outputTokens)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude HUD Report</title>
${chartJs ? `<script>${chartJs}</script>` : `<script src="${CHARTJS_CDN}"></script>`}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, 'Segoe UI', monospace; padding: 24px; }
  h1 { color: #58a6ff; margin-bottom: 8px; font-size: 24px; }
  .meta { color: #8b949e; font-size: 13px; margin-bottom: 24px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .card .label { color: #8b949e; font-size: 12px; text-transform: uppercase; }
  .card .value { font-size: 28px; font-weight: bold; color: #f0f6fc; margin-top: 4px; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .chart-box { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .chart-box h2 { font-size: 14px; color: #8b949e; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; }
  th { background: #21262d; color: #8b949e; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; }
  td { padding: 10px 12px; border-top: 1px solid #21262d; font-size: 13px; }
  tr:hover td { background: #1c2128; }
  @media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Claude HUD Report</h1>
<p class="meta">Generated ${new Date(data.generatedAt).toLocaleString()} · ${data.totals.sessions} sessions · ${data.totals.activeDays} active days</p>

<div class="cards">
  <div class="card"><div class="label">Total Sessions</div><div class="value">${data.totals.sessions}</div></div>
  <div class="card"><div class="label">Total Tokens</div><div class="value">${formatTokenCount(data.totals.tokens)}</div></div>
  <div class="card"><div class="label">Active Days</div><div class="value">${data.totals.activeDays}</div></div>
</div>

<div class="charts">
  <div class="chart-box"><h2>Daily Tokens (Last 30 Days)</h2><canvas id="tokenChart"></canvas></div>
  <div class="chart-box"><h2>Model Distribution (Tokens)</h2><canvas id="modelChart" style="max-height:260px"></canvas></div>
</div>

<h2 style="color:#8b949e;font-size:14px;text-transform:uppercase;margin-bottom:12px">Projects</h2>
<table style="margin-bottom:32px">
  <thead><tr><th>Project</th><th>Sessions</th><th>Input</th><th>Output</th><th>Last Activity</th></tr></thead>
  <tbody>${projectRows}</tbody>
</table>

<h2 style="color:#8b949e;font-size:14px;text-transform:uppercase;margin-bottom:12px">Recent Sessions (top 100)</h2>
<table>
  <thead><tr><th>Project</th><th>Last Activity</th><th>Model</th><th>Input</th><th>Output</th></tr></thead>
  <tbody>${sessionsRows}</tbody>
</table>

<script>
const DATA = ${JSON.stringify(data)};
const daily = DATA.daily.slice(-30);
const labels = daily.map(d => d.date.slice(5));

const chartDefaults = { responsive: true, plugins: { legend: { labels: { color: '#8b949e' } } }, scales: { x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }, y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } } } };

new Chart(document.getElementById('tokenChart'), {
  type: 'bar',
  data: { labels, datasets: [
    { label: 'Input', data: daily.map(d => d.inputTokens), backgroundColor: '#58a6ff' },
    { label: 'Output', data: daily.map(d => d.outputTokens), backgroundColor: '#d2a8ff' }
  ] },
  options: { ...chartDefaults, scales: { ...chartDefaults.scales, x: { ...chartDefaults.scales.x, stacked: true }, y: { ...chartDefaults.scales.y, stacked: true } } }
});

const modelData = DATA.modelBreakdown;
const modelLabels = Object.keys(modelData);
const modelColors = { Opus: '#f85149', Sonnet: '#58a6ff', Haiku: '#3fb950' };
new Chart(document.getElementById('modelChart'), {
  type: 'doughnut',
  data: { labels: modelLabels, datasets: [{ data: modelLabels.map(k => modelData[k].tokens), backgroundColor: modelLabels.map(k => modelColors[k] || '#8b949e') }] },
  options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#c9d1d9' } } } }
});
</script>
</body>
</html>`;
}
