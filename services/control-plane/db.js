import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";

/**
 * SQLite store for the control plane. Synchronous (node:sqlite) — fine because
 * the frp hooks are already a synchronous gate on tunnel establishment and the
 * DB is a loopback file on the same VM. Requires Node >= 22.5 (node:sqlite);
 * this module is never imported by the CI test glob (decisions.js holds the
 * pure, everywhere-testable logic).
 */

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function nowIso() {
  return new Date().toISOString();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  external_id TEXT,
  email TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  banned_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(kind, external_id)
);
CREATE TABLE IF NOT EXISTS api_tokens(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS subdomain_claims(
  subdomain TEXT PRIMARY KEY,
  account_id INTEGER,
  owner_ip TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS active_tunnels(
  subdomain TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  account_id INTEGER,
  owner_ip TEXT,
  opened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_active_owner ON active_tunnels(owner_key);
`;

export function openDb(path = ":memory:") {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode=WAL;");
  db.exec(SCHEMA);

  return {
    raw: db,

    resolveToken(tokenHash) {
      const t = db.prepare("SELECT * FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL").get(tokenHash);
      if (!t) return null;
      db.prepare("UPDATE api_tokens SET last_used_at=? WHERE id=?").run(nowIso(), t.id);
      return db.prepare("SELECT * FROM accounts WHERE id=?").get(t.account_id) || null;
    },

    getClaim(subdomain) {
      return db.prepare("SELECT * FROM subdomain_claims WHERE subdomain=?").get(subdomain) || null;
    },

    activeCount(ownerKey) {
      return db.prepare("SELECT COUNT(*) AS c FROM active_tunnels WHERE owner_key=?").get(ownerKey).c;
    },

    openTunnel({ subdomain, ownerKey, accountId = null, ip = null }) {
      const now = nowIso();
      db.prepare(
        "INSERT OR REPLACE INTO active_tunnels(subdomain, owner_key, account_id, owner_ip, opened_at) VALUES(?,?,?,?,?)",
      ).run(subdomain, ownerKey, accountId, ip, now);
      db.prepare(
        `INSERT INTO subdomain_claims(subdomain, account_id, owner_ip, created_at, last_used_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(subdomain) DO UPDATE SET last_used_at=excluded.last_used_at`,
      ).run(subdomain, accountId, ip, now, now);
    },

    closeTunnel(subdomain) {
      db.prepare("DELETE FROM active_tunnels WHERE subdomain=?").run(subdomain);
    },

    createAccount({ kind, externalId = null, email = null, tier = "free" }) {
      const r = db.prepare(
        "INSERT INTO accounts(kind, external_id, email, tier, created_at) VALUES(?,?,?,?,?)",
      ).run(kind, externalId, email, tier, nowIso());
      return db.prepare("SELECT * FROM accounts WHERE id=?").get(r.lastInsertRowid);
    },

    /** Find-or-create a GitHub account, deduped on the GitHub user id. */
    upsertGithubAccount({ githubId, email = null }) {
      const id = String(githubId);
      const found = db.prepare("SELECT * FROM accounts WHERE kind='github' AND external_id=?").get(id);
      if (found) return found;
      const r = db.prepare(
        "INSERT INTO accounts(kind, external_id, email, tier, created_at) VALUES('github',?,?,'free',?)",
      ).run(id, email, nowIso());
      return db.prepare("SELECT * FROM accounts WHERE id=?").get(r.lastInsertRowid);
    },

    issueToken(accountId, name = null) {
      const token = "pgl_" + randomBytes(24).toString("hex");
      db.prepare(
        "INSERT INTO api_tokens(account_id, token_hash, name, created_at) VALUES(?,?,?,?)",
      ).run(accountId, hashToken(token), name, nowIso());
      return token; // shown once; only the hash is stored
    },

    banAccount(accountId) {
      db.prepare("UPDATE accounts SET banned_at=? WHERE id=?").run(nowIso(), accountId);
    },
  };
}
