import { createInterface } from "node:readline";
import { createPreview, listPreviews, stopPreview, PreviewError } from "./preview-core.js";

/**
 * Minimal Model Context Protocol server over stdio (JSON-RPC 2.0,
 * newline-delimited). Hand-rolled to keep pugloo dependency-free — MCP stdio
 * is just JSON-RPC with a small method set. stdout carries ONLY protocol
 * messages; everything human-facing goes to stderr.
 *
 * Exposes three tools so coding agents can drive previews natively:
 *   create_preview, list_previews, stop_preview
 */

const PROTOCOL_FALLBACK = "2024-11-05";

const TOOLS = [
  {
    name: "create_preview",
    description:
      "Create a public HTTPS preview URL for the web app running in this project, so a human or another agent can review it. Detects the dev server automatically. Returns a stable URL (same repo+branch always gets the same URL). IMPORTANT: after calling this, include the returned URL in your reply to the user so they can open it. Make sure the dev server is actually running first.",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "Port the dev server listens on. Omit to auto-detect." },
        name: { type: "string", description: "Optional subdomain base name override." },
        ttl: { type: "string", description: "Auto-expire duration, e.g. '30m', '2h', '24h'. Default 24h." },
      },
    },
  },
  {
    name: "list_previews",
    description: "List active preview URLs for the current repo and branch.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "stop_preview",
    description: "Tear down the active preview(s) for the current repo and branch.",
    inputSchema: { type: "object", properties: {} },
  },
];

function ok(text) {
  return { content: [{ type: "text", text }], isError: false };
}
function errResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}

async function callTool(name, args = {}) {
  if (name === "create_preview") {
    try {
      const result = await createPreview({ port: args.port, name: args.name, ttl: args.ttl });
      const lines = [
        `Preview URL: ${result.url}`,
        `Port: ${result.port}  Branch: ${result.branch ?? "(none)"}  Expires: ${result.expires}`,
        result.sibling_of ? `(sibling of ${result.sibling_of})` : "",
        "",
        "Share this URL in your reply so the user (or reviewer agent) can open it.",
        "",
        JSON.stringify(result),
      ].filter(Boolean);
      return ok(lines.join("\n"));
    } catch (err) {
      if (err instanceof PreviewError) {
        const extra = err.extra?.candidates
          ? ` Candidates: ${err.extra.candidates.map((c) => `${c.port} (${c.command})`).join(", ")}.`
          : "";
        return errResult(`${err.message}.${err.hint ? " " + err.hint : ""}${extra}`);
      }
      return errResult(`Internal error: ${err.message}`);
    }
  }
  if (name === "list_previews") {
    const list = listPreviews();
    if (list.length === 0) return ok("No active previews for this repo+branch.");
    return ok(list.map((e) => `${e.url} -> localhost:${e.port} (expires ${e.expires})`).join("\n"));
  }
  if (name === "stop_preview") {
    try {
      const stopped = stopPreview();
      return ok(`Stopped ${stopped.length} preview(s):\n${stopped.join("\n")}`);
    } catch (err) {
      return errResult(err.message);
    }
  }
  throw new Error(`unknown tool: ${name}`);
}

/**
 * Run the MCP server. Reads JSON-RPC requests on stdin, writes responses on
 * stdout. Resolves when stdin closes.
 */
export function startMcpServer({ version = "0.0.0" } = {}) {
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
  const replyError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

  const rl = createInterface({ input: process.stdin });

  // Drain in-flight requests before resolving on stdin close, so a tool call
  // that is still running when EOF arrives (piped input, or client shutdown)
  // still gets its response written.
  let pending = 0;
  let closed = false;
  let resolveClose;
  const closePromise = new Promise((r) => (resolveClose = r));
  const maybeClose = () => {
    if (closed && pending === 0) resolveClose();
  };

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return; // ignore unparseable input
    }
    const { id, method, params } = req;

    // Notifications (no id) need no response.
    if (id === undefined || id === null) {
      return;
    }

    pending++;
    try {
      switch (method) {
        case "initialize":
          reply(id, {
            protocolVersion: params?.protocolVersion || PROTOCOL_FALLBACK,
            capabilities: { tools: {} },
            serverInfo: { name: "pugloo", version },
          });
          return;
        case "ping":
          reply(id, {});
          return;
        case "tools/list":
          reply(id, { tools: TOOLS });
          return;
        case "tools/call": {
          const result = await callTool(params?.name, params?.arguments || {});
          reply(id, result);
          return;
        }
        default:
          replyError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      replyError(id, -32603, err.message || "Internal error");
    } finally {
      pending--;
      maybeClose();
    }
  });

  rl.on("close", () => {
    closed = true;
    maybeClose();
  });

  process.stderr.write("pugloo MCP server ready (stdio)\n");
  return closePromise;
}
