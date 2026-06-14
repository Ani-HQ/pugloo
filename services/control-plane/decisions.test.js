import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideLogin,
  decideNewProxy,
  ownerKeyFor,
  claimOwnerKey,
  toFrpResponse,
  tierFor,
  TIERS,
} from "./decisions.js";

const acct = { id: 7, tier: "free", banned_at: null };
const banned = { id: 8, tier: "free", banned_at: "2026-01-01" };

test("Login: anonymous (no token) is allowed", () => {
  assert.equal(decideLogin({ account: null, hadToken: false }).ok, true);
});

test("Login: a token that doesn't resolve is rejected", () => {
  assert.equal(decideLogin({ account: null, hadToken: true }).ok, false);
});

test("Login: banned account is rejected", () => {
  assert.equal(decideLogin({ account: banned, hadToken: true }).ok, false);
});

test("NewProxy: under quota is allowed", () => {
  const v = decideNewProxy({ account: acct, ownerKey: "acct:7", claim: null, activeCount: 0 });
  assert.equal(v.ok, true);
});

test("NewProxy: at the tier concurrency limit is denied", () => {
  const v = decideNewProxy({ account: acct, ownerKey: "acct:7", claim: null, activeCount: 3 });
  assert.equal(v.ok, false);
  assert.match(v.reason, /concurrent tunnel limit/);
});

test("NewProxy: anonymous limit is 1", () => {
  assert.equal(decideNewProxy({ account: null, ownerKey: "ip:1.2.3.4", claim: null, activeCount: 0 }).ok, true);
  assert.equal(decideNewProxy({ account: null, ownerKey: "ip:1.2.3.4", claim: null, activeCount: 1 }).ok, false);
});

test("NewProxy: subdomain claimed by another owner is denied", () => {
  const claim = { account_id: 99, owner_ip: null };
  const v = decideNewProxy({ account: acct, ownerKey: "acct:7", claim, activeCount: 0 });
  assert.equal(v.ok, false);
  assert.match(v.reason, /another owner/);
});

test("NewProxy: re-claiming your own subdomain is allowed", () => {
  const claim = { account_id: 7, owner_ip: null };
  assert.equal(decideNewProxy({ account: acct, ownerKey: "acct:7", claim, activeCount: 0 }).ok, true);
});

test("NewProxy: banned account denied even under quota", () => {
  assert.equal(decideNewProxy({ account: banned, ownerKey: "acct:8", claim: null, activeCount: 0 }).ok, false);
});

test("ownerKey + claimOwnerKey agree for accounts and IPs", () => {
  assert.equal(ownerKeyFor(acct, "1.2.3.4"), "acct:7");
  assert.equal(ownerKeyFor(null, "1.2.3.4"), "ip:1.2.3.4");
  assert.equal(claimOwnerKey({ account_id: 7 }), "acct:7");
  assert.equal(claimOwnerKey({ account_id: null, owner_ip: "1.2.3.4" }), "ip:1.2.3.4");
});

test("tierFor falls back to free for unknown tier, anonymous for null", () => {
  assert.equal(tierFor(null), TIERS.anonymous);
  assert.equal(tierFor({ tier: "weird" }), TIERS.free);
});

test("toFrpResponse maps verdicts to frp's shape", () => {
  assert.deepEqual(toFrpResponse({ ok: true }), { reject: false, unchange: true });
  assert.deepEqual(toFrpResponse({ ok: false, reason: "nope" }), { reject: true, reject_reason: "nope" });
});
