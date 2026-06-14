import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "pugloo.js");

/**
 * Drive the MCP server over stdio with a list of JSON-RPC requests, collecting
 * responses until every request id has been answered (or timeout).
 */
function rpc(requests, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    // Isolated, writable HOME so ~/.pugloo creation works but the real one is untouched.
    const home = mkdtempSync(join(tmpdir(), "pugloo-mcp-test-"));
    const child = spawn(process.execPath, [bin, "mcp"], { stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, HOME: home } });
    const wantIds = new Set(requests.filter((r) => r.id !== undefined).map((r) => r.id));
    const byId = new Map();
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout; got ids ${[...byId.keys()]}`));
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id !== undefined) byId.set(msg.id, msg);
        if ([...wantIds].every((id) => byId.has(id))) {
          clearTimeout(timer);
          child.stdin.end();
          child.kill();
          resolve(byId);
        }
      }
    });
    child.on("error", reject);
    for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n");
  });
}

test("MCP initialize returns pugloo serverInfo and echoes protocol version", async () => {
  const res = await rpc([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }]);
  const init = res.get(1).result;
  assert.equal(init.serverInfo.name, "pugloo");
  assert.equal(init.protocolVersion, "2025-06-18");
  assert.ok(init.capabilities.tools);
});

test("MCP tools/list exposes the three preview tools", async () => {
  const res = await rpc([{ jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  const names = res.get(2).result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["create_preview", "list_previews", "stop_preview"]);
  const create = res.get(2).result.tools.find((t) => t.name === "create_preview");
  assert.match(create.description, /include the returned URL in your reply/i);
});

test("MCP create_preview on a closed port returns a tool error, not a crash", async () => {
  const res = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize" },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "create_preview", arguments: { port: 59321 } } },
  ]);
  const call = res.get(5).result;
  assert.equal(call.isError, true);
  assert.match(call.content[0].text, /listening|closed|dev server/i);
});

test("MCP unknown method returns JSON-RPC method-not-found", async () => {
  const res = await rpc([{ jsonrpc: "2.0", id: 9, method: "no/such/method" }]);
  assert.equal(res.get(9).error.code, -32601);
});
