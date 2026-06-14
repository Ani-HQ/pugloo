import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewResult,
  PREVIEW_SCHEMA_VERSION,
  SHARE_HINT,
} from "./preview-contract.js";

const base = {
  url: "https://app-main-abc123.pugloo.show",
  expires: "2026-06-11T00:00:00.000Z",
  port: 3000,
  branch: "main",
  stability: "machine",
  transport: "ws",
  subdomain: "app-main-abc123",
};

test("golden: success payload shape (schema v1)", () => {
  const r = buildPreviewResult(base);
  assert.deepEqual(Object.keys(r).sort(), [
    "branch",
    "expires",
    "port",
    "rebound",
    "schema",
    "share_hint",
    "stability",
    "subdomain",
    "transport",
    "url",
  ]);
  assert.equal(r.schema, PREVIEW_SCHEMA_VERSION);
  assert.equal(r.rebound, false);
  assert.equal(r.share_hint, SHARE_HINT);
});

test("share_hint tells the agent to put the URL in its reply", () => {
  assert.match(SHARE_HINT, /URL in your reply/i);
});

test("optional fields appear only when set", () => {
  const r = buildPreviewResult({ ...base, siblingOf: "https://other.pugloo.show", detected: true });
  assert.equal(r.sibling_of, "https://other.pugloo.show");
  assert.equal(r.detected, true);
  const plain = buildPreviewResult(base);
  assert.ok(!("sibling_of" in plain));
  assert.ok(!("detected" in plain));
});

test("null branch is allowed (non-git directories)", () => {
  const r = buildPreviewResult({ ...base, branch: null });
  assert.equal(r.branch, null);
});

test("contract violation throws instead of shipping silently", () => {
  assert.throws(() => buildPreviewResult({ ...base, url: undefined }), /missing "url"/);
});
