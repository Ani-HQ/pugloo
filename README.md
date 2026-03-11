# pugloo

Clean HTTPS URLs for local development. Map `https://myapp.dev` to `localhost:3000` with auto-generated TLS certificates and `/etc/hosts` management.

## Install

```bash
npm i -g pugloo
```

## Quick start

```bash
# Map a domain to a local port
sudo pugloo map myapp.dev 3000

# List active mappings
pugloo list

# Start services from a .pugloo.yaml config
sudo pugloo up
```

Then visit `https://myapp.dev` in your browser.

## Features

- **Real HTTPS** with auto-generated TLS certificates (trusted locally via a project CA)
- **Local domains** that resolve to localhost via `/etc/hosts` (e.g. `.dev`, `.test`, `.local`)
- **Path-based routing** to split traffic across services (`myapp.dev/api` -> port 4000)
- **WebSocket support** out of the box
- **Config file driven** with `.pugloo.yaml` for multi-service projects
- **Background daemon** that stays running and hot-reloads on config changes
- **Public tunnels** to share local sites externally via `pugloo share`
- **macOS and Linux** support

## Configuration

Create a `.pugloo.yaml` in your project root:

```yaml
domain: myapp.dev
services:
  /:
    port: 3000
  /api:
    port: 4000
  /ws:
    port: 4001
```

Then run `sudo pugloo up` to register all mappings at once. Use `pugloo down` to tear them down.

## CLI commands

| Command | Description |
|---|---|
| `pugloo map <domain> <port>` | Map a domain (or domain/path) to a local port |
| `pugloo unmap <domain>` | Remove a domain or path mapping |
| `pugloo up` | Start all services defined in `.pugloo.yaml` |
| `pugloo down` | Stop all services defined in `.pugloo.yaml` |
| `pugloo list` | List all active domain mappings |
| `pugloo status` | Show daemon status and mapping count |
| `pugloo start` | Start the proxy daemon manually |
| `pugloo stop` | Stop the proxy daemon |
| `pugloo share <domain>` | Expose a mapped domain publicly via tunnel |

Most commands that modify `/etc/hosts` require `sudo`.

## How it works

1. **Hosts file** -- `pugloo map` adds a `127.0.0.1 myapp.dev` entry to `/etc/hosts` so the domain resolves locally.
2. **TLS certificates** -- A local Certificate Authority is created in `~/.pugloo/` on first run. Per-domain certificates are generated and signed by this CA. Trust the CA once in your system keychain for green-lock HTTPS.
3. **Reverse proxy** -- A background daemon runs an HTTPS server (port 10443) and an HTTP server (port 10080, redirects to HTTPS). Incoming requests are routed to the correct `localhost:<port>` target using SNI for certificate selection and longest-prefix path matching.
4. **Hot reload** -- When mappings change, the daemon reloads its routing table from `~/.pugloo/mappings.json` without restarting.

## License

MIT

## Clockwork commit automation

If you want repo-local post-commit automation for docs and Cursor context:

```bash
npm run hooks:install
```

This installs a `post-commit` hook in this repository only. After each commit it runs:

- `scripts/post-commit-clockwork.mjs` to refresh `.cursor/context/last-commit.md`
- Auto commit feed sync in `docs/changelog.html`
