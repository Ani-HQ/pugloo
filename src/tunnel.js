import WebSocket from "ws";
import http from "node:http";
import https from "node:https";

const DEFAULT_SERVER = "wss://tunnel.pugloo.dev";

/**
 * Map of domain -> { ws, publicUrl }
 */
const activeTunnels = new Map();

/**
 * Parse TTL string like "30m", "1h", "24h" to seconds.
 */
export function parseTtl(str) {
  if (typeof str === "number") return str;
  if (!str || typeof str !== "string") return undefined;
  const m = str.trim().match(/^(\d+)(s|m|h|d)?$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || "s").toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[unit] ?? 1);
}

/**
 * Expose a local domain or port publicly through a WebSocket tunnel.
 *
 * @param {string} domain - The local domain to share (e.g. "myapp.test"), or use options.port.
 * @param {object} [options]
 * @param {number} [options.port]      - Share localhost:port directly (instead of domain).
 * @param {string} [options.subdomain]  - Request a specific subdomain (e.g. "demo" -> demo.pugloo.show).
 * @param {string} [options.password] - Optional password to protect the tunnel.
 * @param {number|string} [options.ttl] - Time-to-live in seconds or "30m", "1h", etc.
 * @param {string} [options.domain]    - Custom domain for the public URL (requires backend support).
 * @param {string} [options.server]    - Tunnel server URL (default: wss://tunnel.pugloo.dev).
 * @returns {Promise<{ publicUrl: string }>}
 */
export function shareDomain(domain, options = {}) {
  const serverUrl = options.server || DEFAULT_SERVER;
  const key = options.port ? `port:${options.port}` : domain;

  return new Promise((resolve, reject) => {
    if (activeTunnels.has(key)) {
      resolve({ publicUrl: activeTunnels.get(key).publicUrl });
      return;
    }

    const ws = new WebSocket(serverUrl);
    const ttl = parseTtl(options.ttl);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "register",
          domain: options.port ? undefined : domain,
          port: options.port || undefined,
          subdomain: options.subdomain || undefined,
          password: options.password || undefined,
          ttl: ttl || undefined,
          customDomain: options.domain || undefined,
        }),
      );
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      if (msg.type === "registered") {
        const publicUrl = msg.url;
        activeTunnels.set(key, { ws, publicUrl, domain, port: options.port });
        resolve({ publicUrl });
        return;
      }

      if (msg.type === "request") {
        handleTunnelRequest(ws, domain, options.port, msg);
      }
    });

    ws.on("error", (err) => {
      if (!activeTunnels.has(key)) {
        reject(err);
      }
    });

    ws.on("close", () => {
      activeTunnels.delete(key);
    });
  });
}

/**
 * Forward an incoming tunnel request to the local server and send the
 * response back through the WebSocket.
 */
function handleTunnelRequest(ws, domain, port, msg) {
  const { requestId, method, path, headers, body } = msg;

  const targetHost = "127.0.0.1";
  const reqHeaders = { ...(headers || {}), host: domain || "localhost" };

  const opts = {
    hostname: targetHost,
    port: port ?? 10443,
    path: path || "/",
    method: method || "GET",
    headers: reqHeaders,
    rejectUnauthorized: false,
  };

  const client = port ? http : https;
  const proxyReq = client.request(
    opts,
    (proxyRes) => {
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("base64");
        ws.send(
          JSON.stringify({
            type: "response",
            requestId,
            statusCode: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: responseBody,
          }),
        );
      });
    },
  );

  proxyReq.on("error", (err) => {
    ws.send(
      JSON.stringify({
        type: "response",
        requestId,
        statusCode: 502,
        headers: { "content-type": "text/plain" },
        body: Buffer.from(`Upstream error: ${err.message}`).toString("base64"),
      }),
    );
  });

  if (body) {
    proxyReq.write(Buffer.from(body, "base64"));
  }
  proxyReq.end();
}

/**
 * Close the tunnel connection for the given domain or port key.
 */
export function stopSharing(domainOrKey) {
  const tunnel = activeTunnels.get(domainOrKey);
  if (!tunnel) return;

  tunnel.ws.close();
  activeTunnels.delete(domainOrKey);
}

/**
 * Return a list of currently active tunnel connections.
 *
 * @returns {{ domain: string, publicUrl: string }[]}
 */
export function listShares() {
  const result = [];
  for (const [domain, info] of activeTunnels) {
    result.push({ domain, publicUrl: info.publicUrl });
  }
  return result;
}
