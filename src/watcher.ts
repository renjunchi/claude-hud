import { join } from "path";
import { homedir } from "os";
import { mkdirSync, unlinkSync, readFileSync } from "fs";
import { scanActiveSessions, scanSessionNotifications } from "./sessions";

const CACHE_DIR = join(homedir(), ".claude", "cli-hud-cache");
export const PID_FILE = join(CACHE_DIR, "watcher.pid");
const POLL_INTERVAL_MS = 5_000;
const MAX_EMPTY_SCANS = 60; // 连续 60 次空扫描（5 分钟）后自动退出

let emptyCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;

async function watchLoop(): Promise<void> {
  try {
    const sessions = await scanActiveSessions();
    if (sessions.length === 0) {
      emptyCount++;
      if (emptyCount >= MAX_EMPTY_SCANS) {
        cleanup();
        process.exit(0);
      }
      return;
    }
    emptyCount = 0;
    // watcher 不属于任何会话，检查所有会话
    await scanSessionNotifications(sessions);
  } catch {
    // 扫描失败不影响下次轮询
  }
}

function cleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  try {
    unlinkSync(PID_FILE);
  } catch {
    // 文件不存在或已删除
  }
}

export function readPid(): number | null {
  try {
    const text = readFileSync(PID_FILE, "utf-8").trim();
    const pid = parseInt(text, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isWatcherRunning(): { running: boolean; pid?: number } {
  const pid = readPid();
  if (pid == null) return { running: false };
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    // 进程已不存在，清理残留 PID 文件
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    return { running: false };
  }
}

/** spawn 分离子进程运行 daemon */
export function spawnWatcher(): void {
  const entryPoint = join(import.meta.dir, "index.ts");
  const child = Bun.spawn([process.execPath, entryPoint, "watch", "--daemon"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();
}

// ensureWatcher 内存缓存，避免每次渲染都做系统调用
let lastEnsureCheckAt = 0;
const ENSURE_CACHE_TTL_MS = 2_000;

/**
 * 在 statusline 渲染路径中调用，非阻塞地确保 watcher 在运行。
 * 检查 PID 文件 + 进程存活，不存在则 spawn 分离子进程。
 * 结果缓存 2 秒，减少系统调用频率。
 */
export function ensureWatcher(): void {
  try {
    const now = Date.now();
    if (now - lastEnsureCheckAt < ENSURE_CACHE_TTL_MS) return;
    lastEnsureCheckAt = now;
    if (isWatcherRunning().running) return;
    spawnWatcher();
  } catch {
    // 启动失败不影响 statusline 渲染
  }
}

export async function runDaemon(): Promise<void> {
  // 检查是否已有实例在运行
  const status = isWatcherRunning();
  if (status.running) {
    console.error(`Watcher already running (PID ${status.pid})`);
    process.exit(1);
  }

  // 写 PID 文件（write-then-verify 防止竞态：两个进程同时判断未运行并 spawn）
  mkdirSync(CACHE_DIR, { recursive: true });
  await Bun.write(PID_FILE, String(process.pid));

  // 短暂让出，让并发 spawn 的另一个进程也写完
  await Bun.sleep(50);

  // 验证 PID 文件仍然是自己的（后写入者覆盖前者，前者应退出）
  const writtenPid = readPid();
  if (writtenPid !== process.pid) {
    // 另一个 daemon 抢占了 PID 文件，本进程静默退出
    process.exit(0);
  }

  // 信号处理
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGHUP", () => { cleanup(); process.exit(0); });

  // 立即执行一次，然后定时轮询
  await watchLoop();
  timer = setInterval(watchLoop, POLL_INTERVAL_MS);
}
