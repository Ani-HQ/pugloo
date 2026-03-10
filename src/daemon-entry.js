/**
 * Daemon entry point — this file is forked by daemon.js and runs the proxy
 * server in the background as a detached process.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startProxy, stopProxy, reloadMappings } from "./proxy.js";

const PUGLOO_DIR = path.join(os.homedir(), ".pugloo");
const LOG_PATH = path.join(PUGLOO_DIR, "daemon.log");
const PID_FILE = path.join(PUGLOO_DIR, "daemon.pid");

fs.mkdirSync(PUGLOO_DIR, { recursive: true });

// Redirect stdout and stderr to the daemon log file.
const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });

function log(message) {
  const ts = new Date().toISOString();
  logStream.write(`[${ts}] ${message}\n`);
}

// Override console so any library output also goes to the log.
console.log = (...args) => log(args.join(" "));
console.error = (...args) => log(`ERROR: ${args.join(" ")}`);
console.warn = (...args) => log(`WARN: ${args.join(" ")}`);

async function shutdown() {
  log("Received shutdown signal, stopping proxy...");
  try {
    await stopProxy();
  } catch (err) {
    log(`Error during proxy shutdown: ${err.message}`);
  }

  // Clean up the PID file if it still points to us.
  try {
    const storedPid = fs.readFileSync(PID_FILE, "utf-8").trim();
    if (parseInt(storedPid, 10) === process.pid) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore — file may already be gone.
  }

  logStream.end(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Reload mappings when receiving SIGHUP (sent by CLI after mapping changes).
process.on("SIGHUP", () => {
  log("Received SIGHUP, reloading mappings...");
  reloadMappings();
});

// Start the proxy.
try {
  const { httpPort, httpsPort } = await startProxy();
  log(`Daemon started (PID ${process.pid}) — HTTP :${httpPort}, HTTPS :${httpsPort}`);
} catch (err) {
  log(`Failed to start proxy: ${err.message}`);
  process.exit(1);
}
