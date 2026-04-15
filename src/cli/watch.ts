import { isWatcherRunning, readPid, spawnWatcher, PID_FILE } from "../watcher";
import { unlinkSync } from "fs";

export async function watch(args: string[]): Promise<void> {
  const sub = args[0] || "start";

  switch (sub) {
    case "start":
      return start();
    case "stop":
      return stop();
    case "status":
      return status();
    default:
      console.log("Usage: cli-hud watch [start|stop|status]");
      process.exit(1);
  }
}

async function start(): Promise<void> {
  const s = isWatcherRunning();
  if (s.running) {
    console.log(`Watcher already running (PID ${s.pid})`);
    return;
  }

  // 分离子进程运行 daemon
  spawnWatcher();

  // 等待 PID 文件出现，确认启动成功
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    await Bun.sleep(100);
    const check = isWatcherRunning();
    if (check.running) {
      console.log(`Watcher started (PID ${check.pid})`);
      return;
    }
  }

  console.error("Failed to start watcher (timeout)");
  process.exit(1);
}

function stop(): void {
  const pid = readPid();
  if (pid == null) {
    console.log("Watcher is not running.");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`Watcher stopped (PID ${pid})`);
  } catch {
    console.log("Watcher process not found, cleaning up PID file.");
  }

  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function status(): void {
  const s = isWatcherRunning();
  if (s.running) {
    console.log(`Watcher is running (PID ${s.pid})`);
  } else {
    console.log("Watcher is not running.");
  }
}
