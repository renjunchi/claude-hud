import type { TokenUsage } from "../types";
import { color, cyan, yellow, gray, dim } from "./colors";

/** Format token count: 123, 12.3K, 1.5M */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

/** Render token usage line */
export function renderTokenUsageLine(usage: TokenUsage): string | null {
  const totalIn = usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
  const totalOut = usage.outputTokens;
  if (totalIn === 0 && totalOut === 0) return null;

  const parts: string[] = [];
  parts.push(color(`↓${formatTokenCount(totalIn)}`, cyan));
  parts.push(color(`↑${formatTokenCount(totalOut)}`, yellow));

  return parts.join(color(" │ ", gray));
}
