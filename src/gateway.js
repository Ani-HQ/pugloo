import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync, execFileSync } from "node:child_process";
import { ERR, PreviewError } from "./errors.js";

/**
 * Hosted-gateway defaults and preview.env handling, in one place so the
 * eventual vanity-domain move is a one-line change. Precedence everywhere:
 * real environment > ~/.pugloo/preview.env > these defaults.
 *
 * The IP is the gateway's reserved static address (GCE `pugloo-gateway-ip`);
 * sslip.io resolves `*.<ip>.sslip.io` to it with no DNS records.
 */
export const DEFAULT_FRP_SERVER = "34.122.152.105";
export const DEFAULT_FRP_PORT = 7000;
export const DEFAULT_FRP_DOMAIN = "34.122.152.105.sslip.io";
export const DEFAULT_API_URL = `https://${DEFAULT_FRP_DOMAIN}`;

// Must match the frps version pinned in infra/gateway/setup-gateway.sh.
export const FRP_VERSION = "0.61.1";

const ENV_PATH = join(homedir(), ".pugloo", "preview.env");

/** Parse shell-style `export KEY=value` lines into an object. */
export function parsePreviewEnv(text) {
  const out = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/i);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

export function readPreviewEnv(path = ENV_PATH) {
  if (!existsSync(path)) return {};
  try {
    return parsePreviewEnv(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Merged view of the environment: file values fill gaps, never override a
 * variable the caller already set.
 */
export function withPreviewEnv(env = process.env, path = ENV_PATH) {
  const file = readPreviewEnv(path);
  const merged = { ...file };
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) merged[k] = v;
  }
  return merged;
}

/** Load preview.env into process.env (unset keys only). Used by `pugloo mcp`. */
export function applyPreviewEnv(path = ENV_PATH) {
  for (const [k, v] of Object.entries(readPreviewEnv(path))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function managedFrpcPath() {
  return join(homedir(), ".pugloo", "bin", "frpc");
}

/**
 * Locate frpc: explicit override > PATH > the copy we manage under
 * ~/.pugloo/bin. Returns null when absent (ensureFrpc installs on demand).
 */
export function findFrpc(env = process.env) {
  if (env.PUGLOO_FRP_BIN && existsSync(env.PUGLOO_FRP_BIN)) return env.PUGLOO_FRP_BIN;
  try {
    const p = execSync("which frpc", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (p) return p;
  } catch {}
  const managed = managedFrpcPath();
  return existsSync(managed) ? managed : null;
}

/**
 * Ensure an frpc binary exists, downloading the pinned release to
 * ~/.pugloo/bin/frpc on first use. Idempotent; throws PreviewError on
 * unsupported platforms or download failure.
 */
export async function ensureFrpc({ env = process.env } = {}) {
  const existing = findFrpc(env);
  if (existing) return existing;

  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new PreviewError(ERR.GATEWAY, `Unsupported platform for frpc: ${process.platform}`, "Install frpc manually and set PUGLOO_FRP_BIN.");
  }
  const os = process.platform;
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const release = `frp_${FRP_VERSION}_${os}_${arch}`;
  const url = `https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${release}.tar.gz`;

  const binDir = join(homedir(), ".pugloo", "bin");
  const workDir = join(homedir(), ".pugloo", "tmp-frpc");
  mkdirSync(binDir, { recursive: true });
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const tarPath = join(workDir, "frp.tar.gz");
    writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));
    execFileSync("tar", ["-xzf", tarPath, "-C", workDir], { stdio: ["pipe", "pipe", "pipe"] });
    const extracted = join(workDir, release, "frpc");
    if (!existsSync(extracted)) throw new Error("archive did not contain frpc");
    renameSync(extracted, managedFrpcPath());
    chmodSync(managedFrpcPath(), 0o755);
    return managedFrpcPath();
  } catch (err) {
    throw new PreviewError(
      ERR.GATEWAY,
      `Could not install frpc (${err.message})`,
      `Install frp ${FRP_VERSION} manually (https://github.com/fatedier/frp/releases) and set PUGLOO_FRP_BIN, or put frpc on PATH.`
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
