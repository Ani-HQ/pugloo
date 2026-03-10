import WebSocket from "ws";
import http from "node:http";

const DEFAULT_SERVER = "wss://tunnel.pugloo.dev";

/**
 * Map of domain -> { ws, publicUrl }
 */
const activeTunnels = new Map();

/**
 * Expose a local domain publicly through a WebSocket tunnel.
 *
 * @param {string} domain - The local domain to share (e.g. "myapp.test").
 * @param {object} [options]
 * @param {string} [options.password]  - Optional password to protect the tunnel.
 * @param {number} [options.ttl]       - Time-to-live in seconds for the tunnel.
 * @param {string} [options.server]    - Tunnel server URL (default: wss://tunnel.pugloo.dev).
 * @returns {Promise<{ publicUrl: string }>}
 */
export function shareDomain(domain, options = {}) {
  const serverUrl = options.server || DEFAULT_SERVER;

  return new Promise((resolve, reject) => {
    if (activeTunnels.has(domain)) {
      resolve({ publicUrl: activeTunnels.get(domain).publicUrl });
      return;
    }

    const ws = new WebSocket(serverUrl);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "register",
          domain,
          password: options.password || undefined,
          ttl: options.ttl || undefined,
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
        activeTunnels.set(domain, { ws, publicUrl });
        resolve({ publicUrl });
        return;
      }

      if (msg.type === "request") {
        handleTunnelRequest(ws, domain, msg);
      }
    });

    ws.on("error", (err) => {
      if (!activeTunnels.has(domain)) {
        reject(err);
      }
    });

    ws.on("close", () => {
      activeTunnels.delete(domain);
    });
  });
}

/**
 * Forward an incoming tunnel request to the local server and send the
 * response back through the WebSocket.
 */
function handleTunnelRequest(ws, domain, msg) {
  const { requestId, method, path, headers, body } = msg;

  const reqOptions = {
    hostname: domain,
    port: 443,
    path: path || "/",
    method: method || "GET",
    headers: headers || {},
    rejectUnauthorized: false,
  };

  const proxyReq = http.request(
    { ...reqOptions, port: 80, hostname: "127.0.0.1", headers: { ...reqOptions.headers, host: domain } },
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
 * Close the tunnel connection for the given domain.
 */
export function stopSharing(domain) {
  const tunnel = activeTunnels.get(domain);
  if (!tunnel) return;

  tunnel.ws.close();
  activeTunnels.delete(domain);
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
