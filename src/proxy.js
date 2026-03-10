import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createSecureContext } from 'node:tls';
import { readFileSync, readFile } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import httpProxy from 'http-proxy';
import { getCertPaths, getCAPath } from './certs.js';

const MAPPINGS_PATH = join(homedir(), '.pugloo', 'mappings.json');

let httpServer = null;
let httpsServer = null;
let proxy = null;
let mappings = {};
let secureContextCache = {};

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

function loadMappings() {
  try {
    const raw = readFileSync(MAPPINGS_PATH, 'utf-8');
    mappings = JSON.parse(raw);
    secureContextCache = {};
  } catch (err) {
    if (err.code === 'ENOENT') {
      mappings = {};
    } else {
      console.error(`[pugloo] failed to load mappings: ${err.message}`);
    }
  }
}

/**
 * Reload mappings from disk without restarting the proxy.
 */
export function reloadMappings() {
  loadMappings();
}

// ---------------------------------------------------------------------------
// Route resolution (longest-prefix match)
// ---------------------------------------------------------------------------

function resolveTarget(hostname, url) {
  const domainMap = mappings[hostname];
  if (!domainMap) return null;

  const pathEntries = Object.keys(domainMap).sort(
    (a, b) => b.length - a.length,
  );

  for (const prefix of pathEntries) {
    if (url === prefix || url.startsWith(prefix === '/' ? '/' : prefix + '/') || url.startsWith(prefix + '?')) {
      return domainMap[prefix];
    }
  }

  // Fall back to "/" if nothing else matched
  if (domainMap['/']) return domainMap['/'];

  return null;
}

// ---------------------------------------------------------------------------
// SNI
// ---------------------------------------------------------------------------

function sniCallback(servername, cb) {
  if (secureContextCache[servername]) {
    cb(null, secureContextCache[servername]);
    return;
  }

  try {
    const certPaths = getCertPaths(servername);
    const ctx = createSecureContext({
      key: readFileSync(certPaths.key),
      cert: readFileSync(certPaths.cert),
      ca: readFileSync(getCAPath()),
    });
    secureContextCache[servername] = ctx;
    cb(null, ctx);
  } catch (err) {
    console.error(`[pugloo] SNI error for ${servername}: ${err.message}`);
    cb(err);
  }
}

// ---------------------------------------------------------------------------
// Error page
// ---------------------------------------------------------------------------

function errorPage(target) {
  const url = typeof target === 'string' ? target : target?.target ?? 'unknown';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>pugloo - upstream unavailable</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #1a1a2e; color: #e0e0e0;
    }
    .card {
      background: #16213e; border-radius: 12px; padding: 3rem 4rem;
      box-shadow: 0 4px 24px rgba(0,0,0,.4); text-align: center; max-width: 480px;
    }
    h1 { color: #c084fc; margin-bottom: .25rem; }
    p  { color: #94a3b8; line-height: 1.6; }
    code { background: #0f172a; padding: 2px 8px; border-radius: 4px; color: #f472b6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>pugloo</h1>
    <p>Upstream server at <code>${url}</code> is not responding.</p>
    <p>Make sure the application is running and try again.</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

function handleRequest(req, res) {
  const hostname = (req.headers.host || '').split(':')[0];
  const route = resolveTarget(hostname, req.url);

  if (!route) {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(errorPage(hostname));
    return;
  }

  proxy.web(req, res, { target: route.target, xfwd: true }, (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(errorPage(route.target));
    }
  });
}

function handleUpgrade(req, socket, head) {
  const hostname = (req.headers.host || '').split(':')[0];
  const route = resolveTarget(hostname, req.url);

  if (!route) {
    socket.destroy();
    return;
  }

  proxy.ws(req, socket, head, { target: route.target, xfwd: true }, (err) => {
    socket.destroy();
  });
}

// ---------------------------------------------------------------------------
// HTTP -> HTTPS redirect
// ---------------------------------------------------------------------------

function redirectToHttps(req, res) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  const location = `https://${host}${req.url}`;
  res.writeHead(301, { Location: location });
  res.end();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the reverse proxy.
 *
 * @param {object} [options]
 * @param {number} [options.httpPort=10080]  - Port for the HTTP redirect server.
 * @param {number} [options.httpsPort=10443] - Port for the HTTPS proxy server.
 */
export async function startProxy(options = {}) {
  const httpPort = options.httpPort ?? 10080;
  const httpsPort = options.httpsPort ?? 10443;

  loadMappings();

  proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
  });

  proxy.on('error', (err, req, res) => {
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(errorPage(req?.headers?.host ?? 'unknown'));
    }
  });

  // Pick a fallback cert for the initial TLS handshake. The real cert is
  // selected in the SNI callback, but Node requires *some* cert/key pair
  // when creating the server.
  const domains = Object.keys(mappings);
  let fallbackKey;
  let fallbackCert;

  if (domains.length > 0) {
    const first = getCertPaths(domains[0]);
    fallbackKey = readFileSync(first.key);
    fallbackCert = readFileSync(first.cert);
  } else {
    // Generate a self-signed throwaway context; SNI will override anyway.
    fallbackKey = undefined;
    fallbackCert = undefined;
  }

  httpsServer = createHttpsServer(
    {
      SNICallback: sniCallback,
      ...(fallbackKey ? { key: fallbackKey, cert: fallbackCert } : {}),
    },
    handleRequest,
  );
  httpsServer.on('upgrade', handleUpgrade);

  httpServer = createHttpServer(redirectToHttps);

  await Promise.all([
    new Promise((resolve, reject) => {
      httpsServer.listen(httpsPort, (err) => (err ? reject(err) : resolve()));
    }),
    new Promise((resolve, reject) => {
      httpServer.listen(httpPort, (err) => (err ? reject(err) : resolve()));
    }),
  ]);

  return { httpPort, httpsPort };
}

/**
 * Gracefully shut down both servers and the proxy.
 */
export async function stopProxy() {
  const closes = [];

  if (httpServer) {
    closes.push(
      new Promise((resolve) => httpServer.close(() => resolve())),
    );
    httpServer = null;
  }

  if (httpsServer) {
    closes.push(
      new Promise((resolve) => httpsServer.close(() => resolve())),
    );
    httpsServer = null;
  }

  if (proxy) {
    proxy.close();
    proxy = null;
  }

  secureContextCache = {};
  await Promise.all(closes);
}
