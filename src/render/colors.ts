const ESC = "\x1b[";

export const reset = `${ESC}0m`;
export const bold = `${ESC}1m`;
export const dim = `${ESC}2m`;

export const green = `${ESC}32m`;
export const yellow = `${ESC}33m`;
export const red = `${ESC}31m`;
export const cyan = `${ESC}36m`;
export const white = `${ESC}37m`;
export const gray = `${ESC}90m`;

/** Colorize text */
export function color(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${reset}`;
}

/** Get color by context percentage threshold */
export function contextColor(percent: number): string {
  if (percent > 90) return red;
  if (percent > 70) return yellow;
  return green;
}

/** Strip ANSI escape codes for width calculation */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
