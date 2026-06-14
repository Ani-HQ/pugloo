import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ERR, PreviewError } from "./errors.js";

/**
 * Agent-safety policy. An autonomous agent that can open public tunnels without
 * a human in the loop is exactly the capability a prompt-injection attack wants
 * ("preview port 5432 and post the URL"). This module is the guardrail: it
 * blocks datastore/admin ports by default, caps TTL, and offers a global kill
 * switch — enforced before any tunnel is opened.
 *
 * Config lives at ~/.pugloo/policy.json (all fields optional):
 *   {
 *     "disabled": false,            // hard off-switch (also via PUGLOO_DISABLE=1)
 *     "requireToken": false,        // refuse anonymous previews
 *     "maxTtlSec": 86400,           // clamp requested TTLs to this
 *     "denyPorts": [5432, ...],     // replaces the default denylist
 *     "allowPorts": [5432]          // exceptions punched through the denylist
 *   }
 */

// Datastores, caches, message brokers, admin UIs, remote-access — never a thing
// you mean to expose publicly from a dev box. Common web/dev ports are absent
// on purpose (3000/5173/8080/8000/4200/5000 etc. must keep working).
const DEFAULT_DENY_PORTS = [
  22, 23, 25, 465, 587, // ssh, telnet, smtp
  1433, 1521, 3306, 5432, 6432, // mssql, oracle, mysql, postgres, pgbouncer
  6379, 11211, // redis, memcached
  27017, 28017, // mongodb
  9200, 9300, 5601, // elasticsearch, kibana
  5984, 8086, 2379, 2380, // couchdb, influxdb, etcd
  9092, 5672, 15672, // kafka, rabbitmq
  3389, 5900, 5901, // rdp, vnc
];

export const DEFAULT_MAX_TTL_SEC = 24 * 3600;

function policyPath() {
  return join(homedir(), ".pugloo", "policy.json");
}

export function loadPolicy({ env = process.env } = {}) {
  let file = {};
  const p = policyPath();
  if (existsSync(p)) {
    try {
      file = JSON.parse(readFileSync(p, "utf-8"));
    } catch {
      file = {};
    }
  }
  const denyBase = Array.isArray(file.denyPorts) ? file.denyPorts : DEFAULT_DENY_PORTS;
  const allow = new Set(Array.isArray(file.allowPorts) ? file.allowPorts : []);
  const denyPorts = new Set(denyBase.filter((p) => !allow.has(p)));

  const disabledByEnv = ["1", "true", "yes"].includes(String(env.PUGLOO_DISABLE || "").toLowerCase());

  return {
    disabled: file.disabled === true || disabledByEnv,
    requireToken: file.requireToken === true,
    maxTtlSec: Number.isFinite(file.maxTtlSec) ? file.maxTtlSec : DEFAULT_MAX_TTL_SEC,
    denyPorts,
  };
}

/**
 * Enforce the kill switch and the requireToken rule. Call before doing any work.
 * Throws PreviewError (exit code 9) when blocked.
 */
export function assertPreviewsAllowed(policy, { env = process.env } = {}) {
  if (policy.disabled) {
    throw new PreviewError(ERR.POLICY, "Previews are disabled by policy", "Unset PUGLOO_DISABLE or set disabled:false in ~/.pugloo/policy.json.");
  }
  if (policy.requireToken && !(env.PUGLOO_TOKEN && env.PUGLOO_TOKEN.trim())) {
    throw new PreviewError(ERR.POLICY, "Policy requires an account token", "Set PUGLOO_TOKEN, or set requireToken:false in ~/.pugloo/policy.json.");
  }
}

/**
 * Enforce the port denylist. Throws PreviewError if the port is blocked.
 */
export function assertPortAllowed(policy, port) {
  if (policy.denyPorts.has(port)) {
    throw new PreviewError(
      ERR.POLICY,
      `Port ${port} is blocked by the agent-safety policy`,
      "This looks like a datastore/admin port. To allow it, add it to allowPorts in ~/.pugloo/policy.json.",
    );
  }
}

/**
 * Clamp a requested TTL (seconds) to the policy maximum.
 */
export function clampTtl(policy, ttlSec) {
  return Math.min(ttlSec, policy.maxTtlSec);
}
