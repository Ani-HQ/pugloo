/**
 * Control plane - auth and tunnel registration APIs.
 * Stub implementation; will integrate with Cloud SQL, Redis when deployed.
 */

import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT || "8080", 10);

const routes = {
  "GET /health": (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  },
  "POST /auth/login": (req, res) => {
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Login not yet implemented" }));
  },
  "POST /auth/refresh": (req, res) => {
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Refresh not yet implemented" }));
  },
};

const server = createServer((req, res) => {
  const key = `${req.method} ${req.url?.split("?")[0] || "/"}`;
  const handler = routes[key] || ((_, r) => {
    r.writeHead(404, { "Content-Type": "application/json" });
    r.end(JSON.stringify({ error: "Not found" }));
  });
  handler(req, res);
});

server.listen(PORT, () => {
  console.log(`Control plane listening on :${PORT}`);
});
