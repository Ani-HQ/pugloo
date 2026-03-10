import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PUGLOO_DIR = path.join(os.homedir(), ".pugloo");
const PID_FILE = path.join(PUGLOO_DIR, "daemon.pid");

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
 * Start the daemon by forking the daemon-entry script as a detached process.
 * The parent can exit freely after calling this.
 */
export function startDaemon() {
  if (isDaemonRunning()) {
    return getDaemonPid();
  }

  fs.mkdirSync(PUGLOO_DIR, { recursive: true });

  const child = fork(DAEMON_ENTRY, [], {
    detached: true,
    stdio: "ignore",
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
