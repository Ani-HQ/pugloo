/**
 * Control plane — frp server-plugin handler + admin token minting.
 *
 * frps calls POST /handler on Login/NewProxy/CloseProxy (configured via
 * [[httpPlugins]] in frps.toml). We validate the per-client token, enforce
 * quota + subdomain ownership, and allow/deny. This replaces the single shared
 * frp auth.token. Runs on the gateway VM next to frps (loopback hook).
 *
 * Phase 1: token minting is admin-gated (CONTROL_PLANE_ADMIN_SECRET). Public,
 * sybil-resistant issuance arrives with GitHub OAuth in Phase 2.
 *
 *   FAIL-CLOSED: any error while deciding NewProxy => reject the tunnel.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { openDb, hashToken } from "./db.js";
import {
  decideLogin,
  decideNewProxy,
  ownerKeyFor,
  toFrpResponse,
} from "./decisions.js";
import { authorizeUrl, exchangeWebCode, verifyAppToken } from "./github.js";

const PORT = parseInt(process.env.PORT || "8090", 10);
const DB_PATH = process.env.CONTROL_PLANE_DB || "/var/lib/pugloo/control-plane.db";
const ADMIN_SECRET = process.env.CONTROL_PLANE_ADMIN_SECRET || "";
const GH_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GH_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const PUBLIC_URL = process.env.CONTROL_PLANE_PUBLIC_URL || ""; // e.g. https://api.<host>

/** GitHub user -> pugloo account -> fresh token. Shared by device + web flows. */
function issueForGithubUser(user) {
  const account = db.upsertGithubAccount({ githubId: user.id, email: user.email || null });
  const token = db.issueToken(account.id, `github:${user.login}`);
  return { account, token };
}

function tokenPage(token, login) {
  return `<!doctype html><meta charset=utf-8><title>pugloo — signed in</title>
<body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Signed in as ${login}</h1>
<p>Your pugloo token (save it now — shown once):</p>
<pre style="background:#f4f4f5;padding:1rem;border-radius:8px;user-select:all">${token}</pre>
<p>Then run:</p>
<pre style="background:#f4f4f5;padding:1rem;border-radius:8px;user-select:all">pugloo login --token ${token}</pre>
<p style="color:#666">Previews now run on your account tier with stable URLs.</p>`;
}

const db = openDb(DB_PATH);

// run_id -> { ip, account } learned at Login, used to attribute NewProxy to an
// owner (frp NewProxy content does not always carry the client address).
const sessions = new Map();

// Pending OAuth web-flow states (CSRF protection): state -> expiry epoch ms.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

function mintOauthState() {
  const now = Date.now();
  for (const [s, exp] of pendingStates) if (exp < now) pendingStates.delete(s);
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, now + OAUTH_STATE_TTL_MS);
  return state;
}

function consumeOauthState(state) {
  const exp = state && pendingStates.get(state);
  if (!exp) return false;
  pendingStates.delete(state);
  return exp >= Date.now();
}

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function tokenFromMetas(content) {
  // global client metas (Login) or user metas (NewProxy); proxy metas as fallback
  return content?.user?.metas?.token || content?.metas?.token || null;
}

function ipFromAddress(addr) {
  if (!addr) return null;
  const s = String(addr);
  const i = s.lastIndexOf(":");
  return i > 0 ? s.slice(0, i) : s; // strip :port (best-effort)
}

function resolveAccount(token) {
  if (!token) return { account: null, hadToken: false };
  const account = db.resolveToken(hashToken(token));
  return { account, hadToken: true };
}

function handleLogin(content) {
  const token = tokenFromMetas(content);
  const { account, hadToken } = resolveAccount(token);
  const verdict = decideLogin({ account, hadToken });
  if (!verdict.ok) return toFrpResponse(verdict);

  // frps assigns run_id AFTER this hook, so a first-time login arrives with an
  // empty run_id and the session (ip, account) could never be attributed at
  // NewProxy — every anonymous client collapsed into one ip:unknown quota
  // bucket. Assigning our own run_id here (frps adopts a plugin-modified login
  // content) makes NewProxy attribution work.
  let runId = content?.run_id;
  const assigned = !runId;
  if (assigned) runId = `cp-${randomBytes(12).toString("hex")}`;
  sessions.set(runId, { ip: ipFromAddress(content?.client_address), account });
  if (sessions.size > 5000) sessions.delete(sessions.keys().next().value); // crude bound

  if (assigned) {
    return { reject: false, unchange: false, content: { ...content, run_id: runId } };
  }
  return toFrpResponse(verdict);
}

function handleNewProxy(content) {
  const runId = content?.user?.run_id;
  const sess = (runId && sessions.get(runId)) || {};
  const token = tokenFromMetas(content);
  const account = sess.account ?? resolveAccount(token).account;
  const ip = sess.ip ?? null;
  const subdomain = content?.subdomain || content?.proxy_name;

  const ownerKey = ownerKeyFor(account, ip);
  const claim = subdomain ? db.getClaim(subdomain) : null;
  const activeCount = db.activeCount(ownerKey);

  const verdict = decideNewProxy({ account, ownerKey, claim, activeCount });
  if (verdict.ok && subdomain) {
    db.openTunnel({ subdomain, ownerKey, accountId: account?.id ?? null, ip });
  }
  return toFrpResponse(verdict);
}

function handleCloseProxy(content) {
  const subdomain = content?.subdomain || content?.proxy_name;
  if (subdomain) db.closeTunnel(subdomain);
  return { reject: false, unchange: true };
}

const server = createServer(async (req, res) => {
  const path = req.url?.split("?")[0] || "/";

  if (req.method === "GET" && path === "/health") {
    return send(res, 200, { status: "ok" });
  }

  // Admin-gated token mint (Phase 1). Phase 2 replaces with GitHub OAuth.
  if (req.method === "POST" && path === "/tokens") {
    const auth = req.headers.authorization || "";
    if (!ADMIN_SECRET || auth !== `Bearer ${ADMIN_SECRET}`) {
      return send(res, 401, { error: "unauthorized" });
    }
    const body = await readJson(req);
    const account = db.createAccount({ kind: "admin", externalId: body.name || null, tier: body.tier || "free" });
    const token = db.issueToken(account.id, body.name || null);
    return send(res, 200, { token, account_id: account.id, tier: account.tier });
  }

  // --- GitHub OAuth: device-flow exchange (CLI got the github token itself) ---
  if (req.method === "POST" && path === "/auth/github/exchange") {
    if (!GH_CLIENT_ID || !GH_CLIENT_SECRET) return send(res, 503, { error: "github oauth not configured" });
    const body = await readJson(req);
    // check-token proves the token was issued to OUR app; a bare /user fetch
    // would accept any third-party app's token for the same user.
    const user = body.github_token
      ? await verifyAppToken({ clientId: GH_CLIENT_ID, clientSecret: GH_CLIENT_SECRET, accessToken: body.github_token })
      : null;
    if (!user) return send(res, 401, { error: "invalid github token" });
    const { account, token } = issueForGithubUser(user);
    return send(res, 200, { token, login: user.login, tier: account.tier });
  }

  // --- GitHub OAuth: web flow (signup page button) ---
  if (req.method === "GET" && path === "/auth/github/start") {
    if (!GH_CLIENT_ID) return send(res, 503, { error: "github oauth not configured" });
    const redirectUri = PUBLIC_URL ? `${PUBLIC_URL}/auth/github/callback` : undefined;
    res.writeHead(302, { Location: authorizeUrl({ clientId: GH_CLIENT_ID, redirectUri, state: mintOauthState() }) });
    return res.end();
  }
  if (req.method === "GET" && path === "/auth/github/callback") {
    const params = new URL(req.url, "http://x").searchParams;
    const code = params.get("code");
    if (!consumeOauthState(params.get("state"))) {
      return send(res, 400, { error: "invalid or expired oauth state — restart signup" });
    }
    if (!code || !GH_CLIENT_ID || !GH_CLIENT_SECRET) {
      return send(res, 400, { error: "missing code or oauth config" });
    }
    const redirectUri = PUBLIC_URL ? `${PUBLIC_URL}/auth/github/callback` : undefined;
    const access = await exchangeWebCode({ clientId: GH_CLIENT_ID, clientSecret: GH_CLIENT_SECRET, code, redirectUri });
    const user = access
      ? await verifyAppToken({ clientId: GH_CLIENT_ID, clientSecret: GH_CLIENT_SECRET, accessToken: access })
      : null;
    if (!user) return send(res, 401, { error: "github auth failed" });
    const { token } = issueForGithubUser(user);
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(tokenPage(token, user.login));
  }

  // frp server-plugin webhook.
  if (req.method === "POST" && path === "/handler") {
    const body = await readJson(req);
    const { op, content } = body;
    try {
      let result;
      if (op === "Login") result = handleLogin(content);
      else if (op === "NewProxy") result = handleNewProxy(content);
      else if (op === "CloseProxy") result = handleCloseProxy(content);
      else result = { reject: false, unchange: true }; // pass ops we don't manage
      return send(res, 200, result);
    } catch (err) {
      // FAIL-CLOSED: deny on any error during NewProxy; pass-through other ops so
      // a DB blip doesn't lock everyone out at connect (quota is at NewProxy).
      process.stderr.write(`handler error op=${op}: ${err.message}\n`);
      if (op === "NewProxy") {
        return send(res, 200, { reject: true, reject_reason: "control plane unavailable" });
      }
      return send(res, 200, { reject: false, unchange: true });
    }
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stderr.write(`control plane on 127.0.0.1:${PORT}, db=${DB_PATH}\n`);
});

export { server };
