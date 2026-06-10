import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLabel, deriveSuffix, deriveSubdomain } from "./subdomain.js";

test("sanitizeLabel lowercases and replaces invalid chars", () => {
  assert.equal(sanitizeLabel("Feat/Login-Flow"), "feat-login-flow");
  assert.equal(sanitizeLabel("héllo wörld!!"), "h-llo-w-rld");
  assert.equal(sanitizeLabel("--a__b--"), "a-b");
  assert.equal(sanitizeLabel(""), "");
  assert.equal(sanitizeLabel(null), "");
});

test("deriveSuffix is deterministic and owner/repo dependent", () => {
  const a = deriveSuffix("key:abc", "github.com/x/app");
  assert.equal(a, deriveSuffix("key:abc", "github.com/x/app"));
  assert.equal(a.length, 6);
  assert.match(a, /^[0-9a-f]{6}$/);
  assert.notEqual(a, deriveSuffix("key:other", "github.com/x/app"));
  assert.notEqual(a, deriveSuffix("key:abc", "github.com/y/app"));
});

test("deriveSubdomain composes base and suffix", () => {
  const sub = deriveSubdomain({
    repo: "pugloo",
    branch: "feat/login",
    ownerId: "key:abc",
    repoId: "github.com/x/pugloo",
  });
  assert.match(sub, /^pugloo-feat-login-[0-9a-f]{6}$/);
});

test("deriveSubdomain is stable across calls (the consistency guarantee)", () => {
  const args = { repo: "app", branch: "main", ownerId: "tok:t1", repoId: "r1" };
  assert.equal(deriveSubdomain(args), deriveSubdomain(args));
});

test("deriveSubdomain respects --name override", () => {
  const sub = deriveSubdomain({
    repo: "app",
    branch: "main",
    ownerId: "k",
    repoId: "r",
    base: "My Demo",
  });
  assert.match(sub, /^my-demo-[0-9a-f]{6}$/);
});

test("deriveSubdomain handles null branch (non-git, detached fallback upstream)", () => {
  const sub = deriveSubdomain({ repo: "thing", branch: null, ownerId: "k", repoId: "r" });
  assert.match(sub, /^thing-[0-9a-f]{6}$/);
});

test("deriveSubdomain truncates to a valid DNS label (<= 63 chars)", () => {
  const sub = deriveSubdomain({
    repo: "a".repeat(80),
    branch: "b".repeat(80),
    ownerId: "k",
    repoId: "r",
  });
  assert.ok(sub.length <= 63, `label too long: ${sub.length}`);
  assert.match(sub, /-[0-9a-f]{6}$/, "suffix must survive truncation");
  assert.ok(!sub.includes("--"));
});

test("deriveSubdomain never emits an empty stem", () => {
  const sub = deriveSubdomain({ repo: "!!!", branch: null, ownerId: "k", repoId: "r" });
  assert.match(sub, /^preview-[0-9a-f]{6}$/);
});
