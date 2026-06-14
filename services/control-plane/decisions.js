/**
 * Pure authorization/quota/ownership decisions for the frp server-plugin hooks.
 * No I/O — the server feeds in DB lookups and maps the verdict to frp's
 * response shape. Keeping this pure means it runs in CI on every Node version
 * (node:sqlite, used by db.js, needs Node 22.5+ and is isolated there).
 *
 * A verdict is { ok: boolean, reason?: string }.
 */

export const TIERS = {
  anonymous: { maxConcurrent: 1, maxTtlSec: 3600, customSubdomain: false },
  free: { maxConcurrent: 3, maxTtlSec: 24 * 3600, customSubdomain: true },
};

const ok = () => ({ ok: true });
const no = (reason) => ({ ok: false, reason });

export function tierFor(account) {
  if (!account) return TIERS.anonymous;
  return TIERS[account.tier] || TIERS.free;
}

/**
 * ownerKey identifies who is acting: an account id or an anonymous IP.
 * @returns "acct:<id>" | "ip:<addr>"
 */
export function ownerKeyFor(account, ip) {
  return account ? `acct:${account.id}` : `ip:${ip || "unknown"}`;
}

/**
 * Login hook: reject banned accounts and unknown/revoked tokens. A null account
 * with hadToken=true means the token didn't resolve (reject); null with
 * hadToken=false is a legitimate anonymous client (allow).
 */
export function decideLogin({ account, hadToken }) {
  if (hadToken && !account) return no("invalid or revoked token");
  if (account && account.banned_at) return no("account banned");
  return ok();
}

/**
 * NewProxy hook: enforce ban, subdomain ownership, and concurrency quota.
 * @param account   resolved account or null (anonymous)
 * @param ownerKey  ownerKeyFor(account, ip)
 * @param claim     existing subdomain_claims row { account_id, owner_ip } or null
 * @param activeCount  current live tunnels for this owner
 */
export function decideNewProxy({ account, ownerKey, claim, activeCount }) {
  if (account && account.banned_at) return no("account banned");

  if (claim && claimOwnerKey(claim) !== ownerKey) {
    return no("subdomain is claimed by another owner");
  }

  const tier = tierFor(account);
  if (activeCount >= tier.maxConcurrent) {
    return no(`concurrent tunnel limit (${tier.maxConcurrent}) reached`);
  }
  return ok();
}

export function claimOwnerKey(claim) {
  if (claim.account_id != null) return `acct:${claim.account_id}`;
  return `ip:${claim.owner_ip || "unknown"}`;
}

/**
 * Map a pure verdict to frp's plugin response. Accept = unchange (let frps
 * proceed as-is); reject carries a reason the client sees.
 */
export function toFrpResponse(verdict) {
  if (verdict.ok) return { reject: false, unchange: true };
  return { reject: true, reject_reason: verdict.reason };
}
