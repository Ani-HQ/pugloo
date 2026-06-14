import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPolicy, assertPreviewsAllowed, assertPortAllowed, clampTtl, DEFAULT_MAX_TTL_SEC } from "./policy.js";

// loadPolicy reads ~/.pugloo/policy.json; with a throwaway HOME there is no file,
// so we exercise the built-in defaults plus env overrides.
const cleanEnv = { HOME: "/nonexistent-pugloo-policy-test" };

test("default policy blocks common datastore/admin ports", () => {
  const p = loadPolicy({ env: cleanEnv });
  for (const port of [5432, 3306, 6379, 27017, 9200, 22, 3389]) {
    assert.throws(() => assertPortAllowed(p, port), /blocked by the agent-safety policy/, `expected ${port} blocked`);
  }
});

test("default policy allows normal dev ports", () => {
  const p = loadPolicy({ env: cleanEnv });
  for (const port of [3000, 5173, 8080, 8000, 4200, 5000]) {
    assert.doesNotThrow(() => assertPortAllowed(p, port), `expected ${port} allowed`);
  }
});

test("PUGLOO_DISABLE is a hard kill switch", () => {
  const p = loadPolicy({ env: { ...cleanEnv, PUGLOO_DISABLE: "1" } });
  assert.equal(p.disabled, true);
  assert.throws(() => assertPreviewsAllowed(p, { env: cleanEnv }), /disabled by policy/);
});

test("previews allowed by default", () => {
  const p = loadPolicy({ env: cleanEnv });
  assert.doesNotThrow(() => assertPreviewsAllowed(p, { env: cleanEnv }));
});

test("clampTtl caps the requested TTL at the policy max", () => {
  const p = loadPolicy({ env: cleanEnv });
  assert.equal(p.maxTtlSec, DEFAULT_MAX_TTL_SEC);
  assert.equal(clampTtl(p, 999 * 3600), DEFAULT_MAX_TTL_SEC);
  assert.equal(clampTtl(p, 600), 600);
});

test("policy errors carry the POLICY code and JSON contract shape", () => {
  const p = loadPolicy({ env: cleanEnv });
  try {
    assertPortAllowed(p, 5432);
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.errInfo.code, 9);
    assert.equal(err.errInfo.name, "PUGLOO_ERR_POLICY");
    assert.equal(err.toJSON().error, "PUGLOO_ERR_POLICY");
  }
});
