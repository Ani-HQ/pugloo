import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl } from "./github.js";

test("authorizeUrl builds a GitHub authorize URL with scope and client id", () => {
  const u = new URL(authorizeUrl({ clientId: "abc123", redirectUri: "https://x/cb", state: "s1" }));
  assert.equal(u.origin + u.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"), "abc123");
  assert.equal(u.searchParams.get("redirect_uri"), "https://x/cb");
  assert.equal(u.searchParams.get("state"), "s1");
  assert.match(u.searchParams.get("scope"), /read:user/);
});

test("authorizeUrl omits redirect_uri when not provided (device-style)", () => {
  const u = new URL(authorizeUrl({ clientId: "abc123" }));
  assert.equal(u.searchParams.get("client_id"), "abc123");
  assert.equal(u.searchParams.has("redirect_uri"), false);
});

test("verifyAppToken posts to the app's check-token endpoint with basic auth", async (t) => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ user: { id: 42, login: "octo" } }) };
  };
  t.after(() => { globalThis.fetch = realFetch; });

  const { verifyAppToken } = await import("./github.js");
  const user = await verifyAppToken({ clientId: "cid", clientSecret: "sec", accessToken: "gho_x" });
  assert.deepEqual(user, { id: 42, login: "octo" });
  assert.equal(calls[0].url, "https://api.github.com/applications/cid/token");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers.Authorization, `Basic ${Buffer.from("cid:sec").toString("base64")}`);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { access_token: "gho_x" });
});

test("verifyAppToken returns null for a token from another app (404)", async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  t.after(() => { globalThis.fetch = realFetch; });

  const { verifyAppToken } = await import("./github.js");
  assert.equal(await verifyAppToken({ clientId: "cid", clientSecret: "sec", accessToken: "gho_x" }), null);
});
