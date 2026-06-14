import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { getStorePath } from "./store.js";
import { upsertPreview, removePreview } from "./previews.js";
import { shareDomain } from "./tunnel.js";

/**
 * Detached preview runner: owns the tunnel so the CLI can return immediately
 * (agents must never babysit a foreground process). Spawned by the preview
 * command with a JSON config file as argv[2]. Marks its registry entry
 * "live" once the tunnel is established; the parent polls the registry.
 *
 * This is spike-stage plumbing — the plan moves tunnel ownership into the
 * daemon proper (IPC over a unix socket) in the next milestone.
 */

const cfg = JSON.parse(readFileSync(process.argv[2], "utf-8"));
let frpcChild = null;

function goLive(url) {
  upsertPreview({ ...cfg.entry, status: "live", url, pid: process.pid });
}

function shutdown(code = 0) {
  try {
    removePreview(cfg.entry.id);
  } catch {}
  if (frpcChild) frpcChild.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

const ttlMs = cfg.ttlSec * 1000;
setTimeout(() => shutdown(0), ttlMs).unref?.();
// Keep the event loop alive for the TTL window even if transports go quiet.
setInterval(() => {}, 60_000);

if (cfg.transport === "frp") {
  const toml = [
    `serverAddr = "${cfg.frp.server}"`,
    `serverPort = ${cfg.frp.port}`,
    cfg.frp.token ? `auth.token = "${cfg.frp.token}"` : "",
    "",
    "[[proxies]]",
    `name = "${cfg.subdomain}"`,
    `type = "http"`,
    `localPort = ${cfg.port}`,
    `subdomain = "${cfg.subdomain}"`,
    // Rewrite Host to localhost so dev servers that allow-list hosts
    // (Vite 5+, Next) don't reject the public tunnel hostname.
    `hostHeaderRewrite = "localhost"`,
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const tomlPath = getStorePath("frp", `${cfg.subdomain}.toml`);
  writeFileSync(tomlPath, toml, { mode: 0o600 });

  frpcChild = spawn(cfg.frp.bin, ["-c", tomlPath], { stdio: ["ignore", "pipe", "pipe"] });
  let started = false;
  const onOutput = (buf) => {
    if (!started && /start .* success|proxy .* success/i.test(buf.toString())) {
      started = true;
      goLive(`https://${cfg.subdomain}.${cfg.frp.domain}`);
    }
  };
  frpcChild.stdout.on("data", onOutput);
  frpcChild.stderr.on("data", onOutput);
  frpcChild.on("exit", (code) => {
    try {
      unlinkSync(tomlPath);
    } catch {}
    shutdown(started ? 0 : code || 1);
  });
} else {
  // Fallback transport: the existing pugloo WebSocket tunnel.
  shareDomain("localhost", {
    port: cfg.port,
    subdomain: cfg.subdomain,
    ttl: cfg.ttlSec,
    server: cfg.wsServer,
  })
    .then(({ publicUrl }) => goLive(publicUrl))
    .catch(() => shutdown(1));
}
