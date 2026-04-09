import type { ReportData } from "./aggregate";
import { formatTokenCount } from "../render/token-usage";

const CHARTJS_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4";
let chartJsInline: string | null = null;

async function getChartJs(): Promise<string> {
  if (chartJsInline) return chartJsInline;
  try {
    const res = await fetch(CHARTJS_CDN, { signal: AbortSignal.timeout(5000) });
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
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

export async function generateReportHTML(data: ReportData): Promise<string> {
  const chartJs = await getChartJs();
  const projectRows = data.projects.map((p) => {
    const skillsHtml = p.topSkills.length > 0
      ? p.topSkills.map(s => `<span class="skill-tag">${s}</span>`).join(" ")
      : "-";
    return `
    <tr>
      <td>${p.project}</td>
      <td>${p.sessions}</td>
      <td>${formatTokenCount(p.inputTokens)}</td>
      <td>${formatTokenCount(p.outputTokens)}</td>
      <td>${skillsHtml}</td>
      <td>${formatDate(p.lastActivity)}</td>
    </tr>`;
  }).join("");

  const maxSkillCount = data.skillRanking.length > 0 ? data.skillRanking[0].count : 1;
  const skillRows = data.skillRanking.map((s, i) => {
    const barWidth = Math.round((s.count / maxSkillCount) * 100);
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${s.name}</td>
      <td class="skill-count">${s.count}</td>
      <td><div class="skill-bar" style="width:${barWidth}%"></div></td>
    </tr>`;
  }).join("");

  const sessionsRows = data.sessions.slice(0, 100).map((s) => {
    const durationSec = s.firstActivity && s.lastActivity
      ? (new Date(s.lastActivity).getTime() - new Date(s.firstActivity).getTime()) / 1000
      : 0;
    const speed = durationSec >= 1 ? s.outputTokens / durationSec : null;
    const speedStr = speed !== null
      ? (speed >= 1000 ? `${formatTokenCount(Math.round(speed))} tok/s` : speed >= 10 ? `${Math.round(speed)} tok/s` : `${speed.toFixed(1)} tok/s`)
      : "-";
    const durationStr = durationSec >= 1 ? formatDuration(durationSec) : "-";
    const totalInput = s.inputTokens + s.cacheCreationTokens + s.cacheReadTokens;
    const cacheHitRate = totalInput > 0 && s.cacheReadTokens > 0
      ? `${Math.round(s.cacheReadTokens / totalInput * 100)}%`
      : "-";
    return `
    <tr>
      <td>${s.project}</td>
      <td>${formatDate(s.lastActivity)}</td>
      <td>${s.model.replace("claude-", "")}</td>
      <td>${formatTokenCount(s.inputTokens)}</td>
      <td>${formatTokenCount(s.outputTokens)}</td>
      <td>${durationStr}</td>
      <td>${speedStr}</td>
      <td>${cacheHitRate}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude 使用概览</title>
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
  .section-title { color: #8b949e; font-size: 14px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; }
  th { background: #21262d; color: #8b949e; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; }
  td { padding: 10px 12px; border-top: 1px solid #21262d; font-size: 13px; }
  tr:hover td { background: #1c2128; }
  .skill-tag { display: inline-block; background: #1f6feb33; color: #58a6ff; border: 1px solid #1f6feb55; border-radius: 4px; padding: 2px 6px; font-size: 11px; margin: 1px 2px; white-space: nowrap; }
  .skill-bar { height: 16px; background: linear-gradient(90deg, #58a6ff, #1f6feb); border-radius: 3px; min-width: 4px; transition: width 0.3s; }
  .skill-count { color: #8b949e; font-variant-numeric: tabular-nums; }
  @media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Claude 使用概览</h1>
<p class="meta">生成时间 ${new Date(data.generatedAt).toLocaleString("zh-CN")} · ${data.totals.sessions} 个会话 · ${data.totals.activeDays} 个活跃日</p>

<div class="cards">
  <div class="card"><div class="label">总会话数</div><div class="value">${data.totals.sessions}</div></div>
  <div class="card"><div class="label">总 Token 数</div><div class="value">${formatTokenCount(data.totals.tokens)}</div></div>
  <div class="card"><div class="label">活跃天数</div><div class="value">${data.totals.activeDays}</div></div>
  <div class="card"><div class="label">Cache 命中率</div><div class="value">${(() => { const t = data.totals.inputTokens + data.totals.cacheCreationTokens + data.totals.cacheReadTokens; return t > 0 ? Math.round(data.totals.cacheReadTokens / t * 100) : 0; })()}%</div></div>
  <div class="card"><div class="label">Skill 种类</div><div class="value">${data.skillRanking.length}</div></div>
</div>

<div class="charts">
  <div class="chart-box"><h2>每日 Token 用量（近 30 天）</h2><canvas id="tokenChart"></canvas></div>
  <div class="chart-box"><h2>模型分布（Token）</h2><canvas id="modelChart" style="max-height:260px"></canvas></div>
</div>

<h2 class="section-title">Skill 使用排行</h2>
<table style="margin-bottom:32px">
  <thead><tr><th style="width:48px">#</th><th>Skill</th><th style="width:80px">次数</th><th style="min-width:120px"></th></tr></thead>
  <tbody>${skillRows}</tbody>
</table>

<h2 class="section-title">项目概览</h2>
<table style="margin-bottom:32px">
  <thead><tr><th>项目</th><th>会话数</th><th>输入</th><th>输出</th><th>Top Skills</th><th>最近活动</th></tr></thead>
  <tbody>${projectRows}</tbody>
</table>

<h2 class="section-title">近期会话（前 100 条）</h2>
<table>
  <thead><tr><th>项目</th><th>最近活动</th><th>模型</th><th>输入</th><th>输出</th><th>时长</th><th>平均速度</th><th>Cache 命中</th></tr></thead>
  <tbody>${sessionsRows}</tbody>
</table>

<script>
const DATA = ${JSON.stringify({ daily: data.daily, modelBreakdown: data.modelBreakdown })};
const daily = DATA.daily.slice(-30);
const labels = daily.map(d => d.date.slice(5));

function fmtTok(n) { if (n >= 1e6) return (n/1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'; if (n >= 1e3) return (n/1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K'; return String(n); }
const chartDefaults = { responsive: true, plugins: { legend: { labels: { color: '#8b949e' } }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtTok(ctx.raw) } } }, scales: { x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }, y: { ticks: { color: '#8b949e', callback: v => fmtTok(v) }, grid: { color: '#21262d' } } } };

new Chart(document.getElementById('tokenChart'), {
  type: 'bar',
  data: { labels, datasets: [
    { label: '输入', data: daily.map(d => d.inputTokens), backgroundColor: '#58a6ff', yAxisID: 'y' },
    { label: '输出', data: daily.map(d => d.outputTokens), backgroundColor: '#d2a8ff', yAxisID: 'y' },
    { label: '会话数', data: daily.map(d => d.sessions), type: 'line', borderColor: '#3fb950', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, yAxisID: 'y1' }
  ] },
  options: { ...chartDefaults, scales: { ...chartDefaults.scales, x: chartDefaults.scales.x, y: { ...chartDefaults.scales.y, position: 'left' }, y1: { position: 'right', ticks: { color: '#3fb950' }, grid: { drawOnChartArea: false }, title: { display: true, text: '会话数', color: '#3fb950' } } } }
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
