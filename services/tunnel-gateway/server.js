/**
 * Tunnel gateway - accepts WebSocket connections from pugloo CLI and routes
 * incoming HTTP requests to the appropriate connected client.
 *
 * Cloud Run: PORT is set automatically.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = parseInt(process.env.PORT || "8080", 10);
const TUNNEL_HOST = process.env.TUNNEL_HOST || "tunnel.pugloo.dev";

const clients = new Map();
const pendingRequests = new Map();

const httpServer = createServer((req, res) => {
  const host = (req.headers.host || "").toLowerCase();
  const subdomain = host.replace(`.${TUNNEL_HOST}`, "").split(".")[0];

  const client = clients.get(subdomain);

  if (!client) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Tunnel not found.");
    return;
  }

  if (client.password) {
    const url = new URL(req.url, `http://${host}`);
    if (url.searchParams.get("_pw") !== client.password) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: invalid tunnel password.");
      return;
    }
  }

  const requestId = randomBytes(8).toString("hex");

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("base64");

    pendingRequests.set(requestId, { res });

    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        res.writeHead(504, { "Content-Type": "text/plain" });
        res.end("Tunnel request timed out.");
      }
    }, 30_000);

    pendingRequests.get(requestId).timeout = timeout;

    try {
      client.ws.send(
        JSON.stringify({
          type: "request",
          requestId,
          method: req.method,
          path: req.url,
          headers: req.headers,
          body,
        }),
      );
    } catch {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Failed to forward request to tunnel client.");
    }
  });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  let assignedSubdomain = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === "register") {
      const requested = msg.subdomain && /^[a-z0-9-]+$/.test(msg.subdomain)
        ? msg.subdomain.toLowerCase()
        : null;
      const subdomain = requested && !clients.has(requested)
        ? requested
        : randomBytes(4).toString("hex");
      const publicUrl = `https://${subdomain}.${TUNNEL_HOST}`;

      const entry = {
        ws,
        domain: msg.domain,
        port: msg.port,
        password: msg.password || null,
        timer: null,
      };

      if (msg.ttl && typeof msg.ttl === "number") {
        entry.timer = setTimeout(() => {
          ws.close();
          clients.delete(subdomain);
        }, msg.ttl * 1000);
      }

      clients.set(subdomain, entry);
      assignedSubdomain = subdomain;

      ws.send(JSON.stringify({ type: "registered", url: publicUrl, subdomain }));
      return;
    }

    if (msg.type === "response") {
      const pending = pendingRequests.get(msg.requestId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      pendingRequests.delete(msg.requestId);

      const body = msg.body ? Buffer.from(msg.body, "base64") : Buffer.alloc(0);
      pending.res.writeHead(msg.statusCode || 200, msg.headers || {});
      pending.res.end(body);
    }
  });

  ws.on("close", () => {
    if (assignedSubdomain) {
      const entry = clients.get(assignedSubdomain);
      if (entry?.timer) clearTimeout(entry.timer);
      clients.delete(assignedSubdomain);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Tunnel gateway listening on :${PORT} (host: ${TUNNEL_HOST})`);
});
