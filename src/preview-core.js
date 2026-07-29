import { spawn } from "node:child_process";
import { writeFileSync, openSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectListeningPorts } from "./detect-ports.js";
import { gitContext, deriveSubdomain } from "./subdomain.js";
import { getOwner } from "./identity.js";
import { ERR, PreviewError } from "./errors.js";
import { parseTtl } from "./tunnel.js";
import { getStorePath } from "./store.js";
import {
  loadPreviews,
  upsertPreview,
  removePreview,
  findByRepoBranch,
  previewId,
  isPidAlive,
} from "./previews.js";
import { buildPreviewResult } from "./preview-contract.js";
import { loadPolicy, assertPreviewsAllowed, assertPortAllowed, clampTtl } from "./policy.js";
import {
  withPreviewEnv,
  findFrpc,
  ensureFrpc,
  DEFAULT_FRP_SERVER,
  DEFAULT_FRP_PORT,
  DEFAULT_FRP_DOMAIN,
} from "./gateway.js";

/**
 * Shared preview engine used by both the CLI (`pugloo preview`) and the MCP
 * server (`pugloo mcp`). Functions here NEVER touch process stdout or call
 * process.exit — they return a result object or throw PreviewError. That keeps
 * the MCP stdio channel clean (stdout is reserved for JSON-RPC) and makes the
 * logic testable without spawning the CLI.
 */

const DEFAULT_TTL_SEC = 24 * 3600;
const LIVE_POLL_TIMEOUT_MS = 10_000;

// Re-export so existing importers (CLI command, MCP server) can keep importing
// PreviewError from preview-core.
export { PreviewError };

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

export function resolveTransport(env = process.env, { envPath } = {}) {
  // Precedence: real env > ~/.pugloo/preview.env > hosted-gateway defaults, so
  // a fresh `npm i -g pugloo && pugloo preview` reaches the hosted relay with
  // zero configuration. PUGLOO_TRANSPORT=ws opts into the legacy WS tunnel
  // (requires PUGLOO_TUNNEL_SERVER pointing at a self-hosted gateway).
  const e = withPreviewEnv(env, envPath);
  if (e.PUGLOO_TRANSPORT === "ws") return { transport: "ws" };
  return {
    transport: "frp",
    frp: {
      // May be null on first run; createPreview installs it via ensureFrpc.
      bin: findFrpc(e),
      server: e.PUGLOO_FRP_SERVER || DEFAULT_FRP_SERVER,
      port: parseInt(e.PUGLOO_FRP_PORT || String(DEFAULT_FRP_PORT), 10),
      // Personal account token (optional). Sent as frp client metadata and
      // validated by the gateway control-plane plugin; absent = anonymous
      // tier. Replaces the old shared PUGLOO_FRP_TOKEN secret.
      token: e.PUGLOO_TOKEN || "",
      domain: e.PUGLOO_FRP_DOMAIN || DEFAULT_FRP_DOMAIN,
    },
  };
}

function waitForLive(id, startedAt = Date.now()) {
  return new Promise((resolve) => {
    const tick = () => {
      const entries = loadPreviews({ prune: false });
      const e = entries[id];
      if (e && e.status === "live" && e.url) return resolve(e);
      if (e && e.status === "error") return resolve(e);
      if (e && e.status === "starting" && !isPidAlive(e.pid) && Date.now() - startedAt > 1000) {
        return resolve(null);
      }
      if (Date.now() - startedAt > LIVE_POLL_TIMEOUT_MS) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startRunner({ id, subdomain, port, ttlSec, expires, trans, env }) {
  const entry = { id, subdomain, port, status: "starting", pid: null, expires, created: new Date().toISOString() };
  upsertPreview({ ...entry, pid: 0 });

  const cfg = {
    entry,
    transport: trans.transport,
    subdomain,
    port,
    ttlSec,
    frp: trans.frp,
    wsServer: env.PUGLOO_TUNNEL_SERVER || undefined,
  };
  const cfgPath = getStorePath("run", `${subdomain}.json`);
  writeFileSync(cfgPath, JSON.stringify(cfg), { mode: 0o600 });

  const runnerPath = join(dirname(fileURLToPath(import.meta.url)), "preview-runner.js");
  const logFd = openSync(getStorePath("logs", `preview-${subdomain}.log`), "a");
  const child = spawn(process.execPath, [runnerPath, cfgPath], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  upsertPreview({ ...entry, pid: child.pid });
  return waitForLive(id).then((live) => {
    if (!live || live.status === "error") {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {}
      removePreview(id);
      return { live: null, reason: live?.error || null, transport: trans.transport };
    }
    return { live, transport: trans.transport };
  });
}

/**
 * Create (or return the existing) preview for the current repo+branch.
 * @returns the schema-v1 result object. Throws PreviewError on failure.
 */
export async function createPreview({ port: portOpt, name, ttl } = {}, { env = process.env, cwd = process.cwd() } = {}) {
  const policy = loadPolicy({ env });
  assertPreviewsAllowed(policy, { env });

  const ctx = gitContext(cwd, env);
  const owner = getOwner(env);
  const entries = loadPreviews();

  // Resolve the target port.
  let port;
  let detected = false;
  if (portOpt) {
    port = parseInt(portOpt, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new PreviewError(ERR.NO_PORT, `Invalid port: ${portOpt}`, "Pass a port between 1 and 65535.");
    }
    if (!(await isPortListening(port))) {
      throw new PreviewError(ERR.PORT_CLOSED, `Nothing is listening on localhost:${port}`, "Start your dev server first.");
    }
  } else {
    const found = detectListeningPorts();
    if (found.length === 0) {
      throw new PreviewError(ERR.NO_PORT, "No dev server detected", "Start your app, or pass a port.");
    }
    if (found.length > 1) {
      throw new PreviewError(ERR.NO_PORT, "Multiple servers detected — ambiguous", "Pass a port to choose.", {
        candidates: found.map((f) => ({ port: f.port, command: f.command })),
      });
    }
    port = found[0].port;
    detected = true;
  }

  assertPortAllowed(policy, port);

  const requestedTtl = ttl ? parseTtl(ttl) ?? DEFAULT_TTL_SEC : DEFAULT_TTL_SEC;
  const ttlSec = clampTtl(policy, requestedTtl);
  const expires = new Date(Date.now() + ttlSec * 1000).toISOString();

  let base = name;
  let siblingOf;
  let rebound = false;
  const subdomain0 = deriveSubdomain({ repo: ctx.repo, branch: ctx.branch, ownerId: owner.ownerId, repoId: ctx.repoId, base });
  const prior = entries[previewId(ctx.repoId, ctx.branch, subdomain0)];

  if (prior && prior.status === "live") {
    if (prior.port === port) {
      upsertPreview({ ...prior, expires });
      return buildPreviewResult({ url: prior.url, expires, port, branch: ctx.branch, rebound: false, stability: owner.stability, transport: prior.transport || "ws", subdomain: prior.subdomain, detected });
    }
    if (await isPortListening(prior.port)) {
      siblingOf = prior.url;
      base = base || `${ctx.repo}-${ctx.branch ?? ""}-${port}`;
    } else {
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

  const trans = resolveTransport(env);
  if (trans.transport === "frp" && !trans.frp.bin) {
    trans.frp.bin = await ensureFrpc({ env });
  }

  const { live, reason, transport } = await startRunner({ id, subdomain, port, ttlSec, expires, trans, env });
  if (!live) {
    if (reason && /token|banned|revoked|unauthorized|limit|quota|claimed/i.test(reason)) {
      const hint = /limit|quota/i.test(reason)
        ? "Stop an existing preview (`pugloo preview --stop`) or `pugloo login` for a higher tier."
        : /claimed/i.test(reason)
          ? "That subdomain belongs to another owner — pass --name to pick a different one."
          : "Run `pugloo login` to refresh your token.";
      throw new PreviewError(ERR.AUTH, `Gateway rejected the tunnel: ${reason}`, hint);
    }
    throw new PreviewError(
      ERR.GATEWAY,
      reason ? `Could not establish the tunnel: ${reason}` : "Could not establish the tunnel",
      "Re-run preview (idempotent); check `pugloo doctor` and ~/.pugloo/logs/."
    );
  }
  upsertPreview({ ...live, transport, expires });
  return buildPreviewResult({ url: live.url, expires, port, branch: ctx.branch, rebound, stability: owner.stability, transport, subdomain, siblingOf, detected });
}

/**
 * List live previews for the current repo+branch (or all if allRepos).
 */
export function listPreviews({ env = process.env, cwd = process.cwd(), allRepos = false } = {}) {
  const entries = loadPreviews();
  if (allRepos) return Object.values(entries);
  const ctx = gitContext(cwd, env);
  return findByRepoBranch(entries, ctx.repoId, ctx.branch);
}

/**
 * Stop previews for the current repo+branch. Returns the stopped URLs.
 * Throws PreviewError if there is nothing to stop.
 */
export function stopPreview({ env = process.env, cwd = process.cwd() } = {}) {
  const ctx = gitContext(cwd, env);
  const entries = loadPreviews();
  const existing = findByRepoBranch(entries, ctx.repoId, ctx.branch);
  if (existing.length === 0) {
    throw new PreviewError(ERR.SUBDOMAIN, `No live preview for ${ctx.repo}${ctx.branch ? `@${ctx.branch}` : ""}`, "Run preview first.");
  }
  for (const e of existing) {
    try {
      process.kill(e.pid, "SIGTERM");
    } catch {}
    removePreview(e.id);
  }
  return existing.map((e) => e.url);
}
