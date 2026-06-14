import { Command } from "commander";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { writeFileSync, openSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bold, cyan, green, symbols } from "../colors.js";
import { detectListeningPorts } from "../detect-ports.js";
import { gitContext, deriveSubdomain } from "../subdomain.js";
import { getOwner } from "../identity.js";
import { ERR, fail } from "../errors.js";
import { parseTtl } from "../tunnel.js";
import { getStorePath } from "../store.js";
import {
  loadPreviews,
  upsertPreview,
  removePreview,
  findByRepoBranch,
  previewId,
  isPidAlive,
} from "../previews.js";
import { buildPreviewResult } from "../preview-contract.js";

const DEFAULT_TTL_SEC = 24 * 3600;
const LIVE_POLL_TIMEOUT_MS = 10_000;

function isPortListening(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    const done = (up) => {
      sock.destroy();
      resolve(up);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.on("connect", () => done(true));
    sock.on("error", () => done(false));
  });
}

function resolveTransport(env = process.env) {
  if (env.PUGLOO_FRP_SERVER && env.PUGLOO_FRP_DOMAIN) {
    let bin = env.PUGLOO_FRP_BIN;
    if (!bin) {
      try {
        bin = execSync("which frpc", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      } catch {
        bin = null;
      }
    }
    if (bin) {
      return {
        transport: "frp",
        frp: {
          bin,
          server: env.PUGLOO_FRP_SERVER,
          port: parseInt(env.PUGLOO_FRP_PORT || "7000", 10),
          token: env.PUGLOO_FRP_TOKEN || "",
          domain: env.PUGLOO_FRP_DOMAIN,
        },
      };
    }
  }
  return { transport: "ws" };
}

function output(result, json) {
  if (json) {
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  console.log(`\n  ${symbols.check} Preview live: ${bold(green(result.url))}`);
  console.log(`  ${symbols.arrow} localhost:${result.port} ${result.branch ? `(${cyan(result.branch)})` : ""}`);
  console.log(`  Expires ${result.expires}. Stop with ${bold("pugloo preview --stop")}.\n`);
}

function waitForLive(id, startedAt = Date.now()) {
  return new Promise((resolve) => {
    const tick = () => {
      const entries = loadPreviews({ prune: false });
      const e = entries[id];
      if (e && e.status === "live" && e.url) return resolve(e);
      if (e && e.status === "starting" && !isPidAlive(e.pid) && Date.now() - startedAt > 1000) {
        return resolve(null);
      }
      if (Date.now() - startedAt > LIVE_POLL_TIMEOUT_MS) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function startRunner({ id, subdomain, port, ttlSec, opts, expires }) {
  const trans = resolveTransport();
  const entry = { id, subdomain, port, status: "starting", pid: null, expires, created: new Date().toISOString() };
  upsertPreview({ ...entry, pid: 0 });

  const cfg = {
    entry,
    transport: trans.transport,
    subdomain,
    port,
    ttlSec,
    frp: trans.frp,
    wsServer: opts.server || process.env.PUGLOO_TUNNEL_SERVER || undefined,
  };
  const cfgPath = getStorePath("run", `${subdomain}.json`);
  writeFileSync(cfgPath, JSON.stringify(cfg), { mode: 0o600 });

  const runnerPath = join(dirname(fileURLToPath(import.meta.url)), "..", "preview-runner.js");
  const logFd = openSync(getStorePath("logs", `preview-${subdomain}.log`), "a");
  const child = spawn(process.execPath, [runnerPath, cfgPath], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  upsertPreview({ ...entry, pid: child.pid });
  const live = await waitForLive(id);
  if (!live) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {}
    removePreview(id);
  }
  return { live, transport: trans.transport };
}

const previewCommand = new Command("preview")
  .description("Create a stable public HTTPS preview URL for the app in this repo (experimental)")
  .option("--json", "Machine-readable output (JSON on stdout, exit codes per docs)")
  .option("-p, --port <port>", "Port to preview (default: auto-detect)")
  .option("--name <name>", "Override the subdomain base name")
  .option("--ttl <duration>", "Auto-expire after duration (default 24h)")
  .option("--server <url>", "Tunnel server override (ws transport)")
  .option("--stop", "Tear down the preview for this repo+branch")
  .action(async (opts) => {
    const json = !!opts.json;
    try {
      const ctx = gitContext();
      const owner = getOwner();
      const entries = loadPreviews();
      const existing = findByRepoBranch(entries, ctx.repoId, ctx.branch);

      if (opts.stop) {
        if (existing.length === 0) {
          fail(json, ERR.SUBDOMAIN, `No live preview for ${ctx.repo}${ctx.branch ? `@${ctx.branch}` : ""}`, "Run pugloo preview first.");
        }
        for (const e of existing) {
          try {
            process.kill(e.pid, "SIGTERM");
          } catch {}
          removePreview(e.id);
        }
        if (json) {
          process.stdout.write(JSON.stringify({ schema: 1, stopped: existing.map((e) => e.url) }) + "\n");
        } else {
          console.log(`${symbols.check} Stopped ${existing.length} preview(s).`);
        }
        return;
      }

      // Resolve the target port.
      let port;
      let detected = false;
      if (opts.port) {
        port = parseInt(opts.port, 10);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          fail(json, ERR.NO_PORT, `Invalid port: ${opts.port}`, "Pass --port <1-65535>.");
        }
        if (!(await isPortListening(port))) {
          fail(json, ERR.PORT_CLOSED, `Nothing is listening on localhost:${port}`, "Start your dev server first.");
        }
      } else {
        const found = detectListeningPorts();
        if (found.length === 0) {
          fail(json, ERR.NO_PORT, "No dev server detected", "Start your app, or pass --port.");
        }
        if (found.length > 1) {
          fail(json, ERR.NO_PORT, "Multiple servers detected — ambiguous", "Pass --port to choose.", {
            candidates: found.map((f) => ({ port: f.port, command: f.command })),
          });
        }
        port = found[0].port;
        detected = true;
      }

      const ttlSec = opts.ttl ? parseTtl(opts.ttl) ?? DEFAULT_TTL_SEC : DEFAULT_TTL_SEC;
      const expires = new Date(Date.now() + ttlSec * 1000).toISOString();

      let base = opts.name;
      let siblingOf;
      let rebound = false;
      const subdomain0 = deriveSubdomain({ repo: ctx.repo, branch: ctx.branch, ownerId: owner.ownerId, repoId: ctx.repoId, base });
      const prior = entries[previewId(ctx.repoId, ctx.branch, subdomain0)];

      if (prior && prior.status === "live") {
        if (prior.port === port) {
          // Idempotent re-run: same URL, refreshed registry TTL.
          upsertPreview({ ...prior, expires });
          output(
            buildPreviewResult({ url: prior.url, expires, port, branch: ctx.branch, rebound: false, stability: owner.stability, transport: prior.transport || "ws", subdomain: prior.subdomain, detected }),
            json,
          );
          return;
        }
        if (await isPortListening(prior.port)) {
          // Old service still alive: never steal its URL — allocate a sibling.
          siblingOf = prior.url;
          base = base || `${ctx.repo}-${ctx.branch ?? ""}-${port}`;
        } else {
          // Old target is gone: rebind the same URL to the new port.
          try {
            process.kill(prior.pid, "SIGTERM");
          } catch {}
          removePreview(prior.id);
          rebound = true;
        }
      }

      const subdomain = siblingOf
        ? deriveSubdomain({ repo: ctx.repo, branch: ctx.branch, ownerId: owner.ownerId, repoId: ctx.repoId, base })
        : subdomain0;
      const id = previewId(ctx.repoId, ctx.branch, subdomain);

      const { live, transport } = await startRunner({ id, subdomain, port, ttlSec, opts, expires });
      if (!live) {
        fail(json, ERR.GATEWAY, "Could not establish the tunnel", "Re-run `pugloo preview` (idempotent); check `pugloo doctor` and the log in ~/.pugloo/logs/.");
      }
      upsertPreview({ ...live, transport, expires });
      output(
        buildPreviewResult({ url: live.url, expires, port, branch: ctx.branch, rebound, stability: owner.stability, transport, subdomain, siblingOf, detected }),
        json,
      );
    } catch (err) {
      fail(json, ERR.INTERNAL, err.message || "Internal error");
    }
  });

export default previewCommand;
