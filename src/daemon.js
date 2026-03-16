import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PUGLOO_DIR = path.join(os.homedir(), ".pugloo");
const PID_FILE = path.join(PUGLOO_DIR, "daemon.pid");
const STDERR_LOG = path.join(PUGLOO_DIR, "daemon-stderr.log");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_ENTRY = path.join(__dirname, "daemon-entry.js");

/**
 * Read the stored daemon PID, or return null if no PID file exists.
 */
export function getDaemonPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Check whether the daemon process is currently alive.
 */
export function isDaemonRunning() {
  const pid = getDaemonPid();
  if (pid === null) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill any process listening on the given port. Cleans up orphaned daemons
 * whose PID file was lost or overwritten.
 */
function killStaleProcess(port) {
  try {
    const output = execSync(
      `lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`,
      { encoding: "utf-8" },
    ).trim();
    if (output) {
      for (const line of output.split("\n")) {
        const pid = parseInt(line, 10);
        if (!Number.isNaN(pid)) {
          try { process.kill(pid, "SIGTERM"); } catch {}
        }
      }
      // Brief wait for the process to release the port.
      try { execSync("sleep 0.5", { stdio: "ignore" }); } catch {}
    }
  } catch {
    // lsof may not be available or no process found.
  }
}

/**
 * Start the daemon by spawning the daemon-entry script as a detached process.
 * Uses spawn instead of fork to avoid inheriting execArgv (fnm shims,
 * --inspect flags, etc.) that can silently crash the child.
 */
export function startDaemon() {
  if (isDaemonRunning()) {
    return getDaemonPid();
  }

  // Clean up orphaned daemons occupying our ports.
  killStaleProcess(10443);
  killStaleProcess(10080);

  fs.mkdirSync(PUGLOO_DIR, { recursive: true });

  // Strip NODE_OPTIONS to prevent dev flags from interfering.
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;
  delete cleanEnv.NODE_DEBUG;

  const errLog = fs.openSync(STDERR_LOG, "a");

  const child = spawn(process.execPath, [DAEMON_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", errLog],
    env: cleanEnv,
  });

  child.on("error", (err) => {
    fs.appendFileSync(STDERR_LOG, `[spawn error] ${err.message}\n`);
  });

  fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");

  child.unref();

  return child.pid;
}

/**
 * Stop the running daemon by sending SIGTERM and cleaning up the PID file.
 */
export function stopDaemon() {
  const pid = getDaemonPid();
  if (pid === null) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may already be gone; that's fine.
  }

  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // PID file may already be removed.
  }
}

/**
 * Start the daemon if it is not already running.
 * Returns the PID of the (possibly already-running) daemon.
 */
export function ensureDaemon() {
  if (isDaemonRunning()) {
    return getDaemonPid();
  }
  return startDaemon();
}

/**
 * Send SIGHUP to the running daemon so it reloads mappings from disk.
 * No-op if the daemon is not running.
 */
export function reloadDaemon() {
  const pid = getDaemonPid();
  if (pid === null) return;

  try {
    process.kill(pid, "SIGHUP");
  } catch {
    // Process may not be running.
  }
}
