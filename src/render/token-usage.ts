import type { TokenUsage, TranscriptData } from "../types";
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

/** Calculate average output tok/s from timestamps */
export function calcOutputSpeed(transcript: TranscriptData): number | null {
  const { firstAssistantTime, lastAssistantTime } = transcript;
  if (!firstAssistantTime || !lastAssistantTime) return null;

  const first = new Date(firstAssistantTime).getTime();
  const last = new Date(lastAssistantTime).getTime();
  const durationSec = (last - first) / 1000;
  if (durationSec < 1) return null;

  return transcript.usage.outputTokens / durationSec;
}

/** Format speed: "42 tok/s", "1.2K tok/s" */
export function formatSpeed(tokPerSec: number): string {
  if (tokPerSec >= 1000) return `${formatTokenCount(Math.round(tokPerSec))} tok/s`;
  if (tokPerSec >= 10) return `${Math.round(tokPerSec)} tok/s`;
  return `${tokPerSec.toFixed(1)} tok/s`;
}

/** Render token usage line */
export function renderTokenUsageLine(usage: TokenUsage, transcript?: TranscriptData): string | null {
  const totalIn = usage.inputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
  const totalOut = usage.outputTokens;
  if (totalIn === 0 && totalOut === 0) return null;

  const parts: string[] = [];
  parts.push(color(`↓${formatTokenCount(totalIn)}`, cyan));
  parts.push(color(`↑${formatTokenCount(totalOut)}`, yellow));

  if (transcript) {
    const speed = calcOutputSpeed(transcript);
    if (speed !== null) {
      parts.push(color(`⚡${formatSpeed(speed)}`, dim));
    }
  }

  return parts.join(color(" │ ", gray));
}
