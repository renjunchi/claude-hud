import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getContextPercent,
  getModelName,
  getProjectName,
  getRateLimit5h,
  getRateLimit7d,
  formatResetCountdown,
  formatResetAbsolute,
  getGitInfo,
} from "./stdin";
import type { StdinData } from "./types";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

describe("getContextPercent", () => {
  test("returns 0 for empty stdin", () => {
    expect(getContextPercent({})).toBe(0);
  });

  test("uses native used_percentage when available", () => {
    const stdin: StdinData = {
      context_window: { used_percentage: 42.7 },
    };
    expect(getContextPercent(stdin)).toBe(43);
  });

  test("rounds native percentage", () => {
    const stdin: StdinData = {
      context_window: { used_percentage: 10.4 },
    };
    expect(getContextPercent(stdin)).toBe(10);
  });

  test("falls back to manual calculation", () => {
    const stdin: StdinData = {
      context_window: {
        context_window_size: 1000,
        current_usage: { input_tokens: 250 },
      },
    };
    expect(getContextPercent(stdin)).toBe(25);
  });

  test("includes cache tokens in fallback (cache_read already in input_tokens)", () => {
    const stdin: StdinData = {
      context_window: {
        context_window_size: 1000,
        current_usage: {
          input_tokens: 100, // 已包含 cache_read_input_tokens
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 100,
        },
      },
    };
    // input_tokens(100) + cache_creation(100) = 200, 200/1000 = 20%
    expect(getContextPercent(stdin)).toBe(20);
  });

  test("caps at 100%", () => {
    const stdin: StdinData = {
      context_window: {
        context_window_size: 100,
        current_usage: { input_tokens: 200 },
      },
    };
    expect(getContextPercent(stdin)).toBe(100);
  });

  test("returns 0 when context_window_size is 0", () => {
    const stdin: StdinData = {
      context_window: {
        context_window_size: 0,
        current_usage: { input_tokens: 100 },
      },
    };
    expect(getContextPercent(stdin)).toBe(0);
  });

  test("returns 0 when current_usage is null", () => {
    const stdin: StdinData = {
      context_window: {
        context_window_size: 1000,
        current_usage: null,
      },
    };
    expect(getContextPercent(stdin)).toBe(0);
  });
});

describe("getModelName", () => {
  test("returns display_name when available", () => {
    expect(getModelName({ model: { display_name: "Opus 4.6", id: "claude-opus" } })).toBe("Opus 4.6");
  });

  test("falls back to id", () => {
    expect(getModelName({ model: { id: "claude-opus" } })).toBe("claude-opus");
  });

  test("returns Unknown when model is missing", () => {
    expect(getModelName({})).toBe("Unknown");
  });
});

describe("getProjectName", () => {
  test("extracts last path segment", () => {
    expect(getProjectName({ cwd: "/Users/foo/projects/my-app" })).toBe("my-app");
  });

  test("returns empty string when cwd is missing", () => {
    expect(getProjectName({})).toBe("");
  });
});

describe("getRateLimit5h", () => {
  test("returns percent and resetsAt", () => {
    const stdin: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: 14.6, resets_at: 1234567890 },
      },
    };
    expect(getRateLimit5h(stdin)).toEqual({ percent: 15, resetsAt: 1234567890 });
  });

  test("returns null when five_hour is missing", () => {
    expect(getRateLimit5h({})).toBeNull();
    expect(getRateLimit5h({ rate_limits: {} })).toBeNull();
    expect(getRateLimit5h({ rate_limits: { five_hour: null } })).toBeNull();
  });

  test("returns null when used_percentage is null", () => {
    expect(getRateLimit5h({ rate_limits: { five_hour: { used_percentage: null } } })).toBeNull();
  });

  test("resetsAt defaults to null", () => {
    const stdin: StdinData = {
      rate_limits: { five_hour: { used_percentage: 10 } },
    };
    expect(getRateLimit5h(stdin)).toEqual({ percent: 10, resetsAt: null });
  });
});

describe("getRateLimit7d", () => {
  test("returns percent and resetsAt", () => {
    const stdin: StdinData = {
      rate_limits: {
        seven_day: { used_percentage: 5.3, resets_at: 9999999999 },
      },
    };
    expect(getRateLimit7d(stdin)).toEqual({ percent: 5, resetsAt: 9999999999 });
  });

  test("returns null when seven_day is missing", () => {
    expect(getRateLimit7d({})).toBeNull();
  });
});

describe("formatResetCountdown", () => {
  test("returns empty string for null", () => {
    expect(formatResetCountdown(null)).toBe("");
  });

  test("returns 'now' when time has passed", () => {
    const pastTime = Math.floor(Date.now() / 1000) - 60;
    expect(formatResetCountdown(pastTime)).toBe("now");
  });

  test("formats minutes only", () => {
    const future = Math.floor(Date.now() / 1000) + 25 * 60;
    expect(formatResetCountdown(future)).toBe("25 min");
  });

  test("formats hours and minutes", () => {
    const future = Math.floor(Date.now() / 1000) + 3 * 3600 + 35 * 60;
    expect(formatResetCountdown(future)).toBe("3 hr 35 min");
  });

  test("formats hours only when no minutes", () => {
    const future = Math.floor(Date.now() / 1000) + 2 * 3600;
    expect(formatResetCountdown(future)).toBe("2 hr");
  });
});

describe("formatResetAbsolute", () => {
  test("returns empty string for null", () => {
    expect(formatResetAbsolute(null)).toBe("");
  });

  test("returns 'now' when time has passed", () => {
    const pastTime = Math.floor(Date.now() / 1000) - 60;
    expect(formatResetAbsolute(pastTime)).toBe("now");
  });

  test("formats as weekday + 12h time", () => {
    // Create a known future date: next occurrence
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(22, 0, 0, 0); // 10:00 PM tomorrow
    const ts = Math.floor(d.getTime() / 1000);

    const result = formatResetAbsolute(ts);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const expectedDay = weekdays[d.getDay()];
    expect(result).toBe(`${expectedDay} 10:00 PM`);
  });

  test("formats AM correctly", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 30, 0, 0); // 9:30 AM tomorrow
    const ts = Math.floor(d.getTime() / 1000);

    const result = formatResetAbsolute(ts);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const expectedDay = weekdays[d.getDay()];
    expect(result).toBe(`${expectedDay} 9:30 AM`);
  });

  test("formats 12:00 PM (noon) correctly", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    const ts = Math.floor(d.getTime() / 1000);

    const result = formatResetAbsolute(ts);
    expect(result).toContain("12:00 PM");
  });

  test("formats 12:00 AM (midnight) correctly", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    const ts = Math.floor(d.getTime() / 1000);

    const result = formatResetAbsolute(ts);
    expect(result).toContain("12:00 AM");
  });
});

describe("getGitInfo", () => {
  const TMP = join(import.meta.dir, "..", ".test-tmp-git");

  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });
    // 主仓库布局
    mkdirSync(join(TMP, "main", ".git"), { recursive: true });
    writeFileSync(join(TMP, "main", ".git", "HEAD"), "ref: refs/heads/feature-x\n");
    // 主仓库下的子目录（用于验证向上查找）
    mkdirSync(join(TMP, "main", "src", "deep"), { recursive: true });
    // worktree 布局：.git 是文件，指向主仓库 worktrees 目录
    mkdirSync(join(TMP, "wt-checkout"), { recursive: true });
    const wtDir = join(TMP, "main", ".git", "worktrees", "wt-1");
    mkdirSync(wtDir, { recursive: true });
    writeFileSync(join(wtDir, "HEAD"), "ref: refs/heads/wt-branch\n");
    writeFileSync(join(TMP, "wt-checkout", ".git"), `gitdir: ${wtDir}\n`);
    // detached HEAD 主仓库
    mkdirSync(join(TMP, "detached", ".git"), { recursive: true });
    writeFileSync(join(TMP, "detached", ".git", "HEAD"), "abc1234deadbeef\n");
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  test("无 cwd 返回空", async () => {
    expect(await getGitInfo(undefined)).toEqual({ branch: "", isWorktree: false });
  });

  test("非 git 目录返回空", async () => {
    expect(await getGitInfo("/tmp")).toEqual({ branch: "", isWorktree: false });
  });

  test("主仓库返回 branch + isWorktree=false", async () => {
    const info = await getGitInfo(join(TMP, "main"));
    expect(info).toEqual({ branch: "feature-x", isWorktree: false });
  });

  test("主仓库子目录向上查找 .git", async () => {
    const info = await getGitInfo(join(TMP, "main", "src", "deep"));
    expect(info.branch).toBe("feature-x");
    expect(info.isWorktree).toBe(false);
  });

  test("worktree (.git 是文件) 返回 isWorktree=true", async () => {
    const info = await getGitInfo(join(TMP, "wt-checkout"));
    expect(info).toEqual({ branch: "wt-branch", isWorktree: true });
  });

  test("detached HEAD 返回短 SHA", async () => {
    const info = await getGitInfo(join(TMP, "detached"));
    expect(info.branch).toBe("abc1234");
    expect(info.isWorktree).toBe(false);
  });
});
