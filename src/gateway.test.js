import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parsePreviewEnv,
  withPreviewEnv,
  findFrpc,
  DEFAULT_FRP_SERVER,
  DEFAULT_FRP_PORT,
  DEFAULT_FRP_DOMAIN,
} from "./gateway.js";
import { resolveTransport } from "./preview-core.js";

test("parsePreviewEnv reads export lines, quotes, comments", () => {
  const parsed = parsePreviewEnv([
    "# comment",
    "export PUGLOO_TOKEN=pgl_abc",
    'PUGLOO_FRP_DOMAIN="example.dev"',
    "PUGLOO_FRP_PORT='7001'",
    "",
    "not a var line",
  ].join("\n"));
  assert.deepEqual(parsed, {
    PUGLOO_TOKEN: "pgl_abc",
    PUGLOO_FRP_DOMAIN: "example.dev",
    PUGLOO_FRP_PORT: "7001",
  });
});

test("withPreviewEnv: real env wins over file, file fills gaps", () => {
  const dir = mkdtempSync(join(tmpdir(), "pugloo-env-"));
  const envPath = join(dir, "preview.env");
  writeFileSync(envPath, "export PUGLOO_TOKEN=pgl_file\nexport PUGLOO_FRP_DOMAIN=file.dev\n");
  try {
    const merged = withPreviewEnv({ PUGLOO_TOKEN: "pgl_env" }, envPath);
    assert.equal(merged.PUGLOO_TOKEN, "pgl_env");
    assert.equal(merged.PUGLOO_FRP_DOMAIN, "file.dev");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveTransport defaults to the hosted frp gateway with no config", () => {
  const t = resolveTransport({}, { envPath: "/nonexistent/preview.env" });
  assert.equal(t.transport, "frp");
  assert.equal(t.frp.server, DEFAULT_FRP_SERVER);
  assert.equal(t.frp.port, DEFAULT_FRP_PORT);
  assert.equal(t.frp.domain, DEFAULT_FRP_DOMAIN);
  assert.equal(t.frp.token, "");
});

test("resolveTransport: env overrides beat defaults; token flows through", () => {
  const t = resolveTransport(
    {
      PUGLOO_FRP_SERVER: "1.2.3.4",
      PUGLOO_FRP_DOMAIN: "preview.example.dev",
      PUGLOO_FRP_PORT: "7100",
      PUGLOO_TOKEN: "pgl_deadbeef",
      PUGLOO_FRP_BIN: process.execPath,
    },
    { envPath: "/nonexistent/preview.env" }
  );
  assert.equal(t.transport, "frp");
  assert.equal(t.frp.server, "1.2.3.4");
  assert.equal(t.frp.domain, "preview.example.dev");
  assert.equal(t.frp.port, 7100);
  assert.equal(t.frp.token, "pgl_deadbeef");
  assert.equal(t.frp.bin, process.execPath);
});

test("resolveTransport: preview.env fills token and domain gaps", () => {
  const dir = mkdtempSync(join(tmpdir(), "pugloo-env-"));
  const envPath = join(dir, "preview.env");
  writeFileSync(envPath, "export PUGLOO_TOKEN=pgl_fromfile\nexport PUGLOO_FRP_DOMAIN=file.dev\n");
  try {
    const t = resolveTransport({}, { envPath });
    assert.equal(t.frp.token, "pgl_fromfile");
    assert.equal(t.frp.domain, "file.dev");
    assert.equal(t.frp.server, DEFAULT_FRP_SERVER);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveTransport: PUGLOO_TRANSPORT=ws opts into the legacy transport", () => {
  const t = resolveTransport({ PUGLOO_TRANSPORT: "ws" }, { envPath: "/nonexistent/preview.env" });
  assert.equal(t.transport, "ws");
});

test("findFrpc honors PUGLOO_FRP_BIN when the file exists", () => {
  assert.equal(findFrpc({ PUGLOO_FRP_BIN: process.execPath, PATH: "" }), process.execPath);
  assert.notEqual(findFrpc({ PUGLOO_FRP_BIN: "/nonexistent/frpc", PATH: "" }), "/nonexistent/frpc");
});
