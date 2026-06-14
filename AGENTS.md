# pugloo for agents

pugloo gives a coding agent one move: turn the app it just started into a public
HTTPS URL it can hand to a reviewer (a human in chat, or another agent). Two ways
to drive it — a native MCP tool, or the CLI contract.

## MCP (recommended)

Run `pugloo mcp` as an MCP server (stdio). It exposes:

| Tool | Args | Returns |
|---|---|---|
| `create_preview` | `port?` (number), `name?` (string), `ttl?` (e.g. `"30m"`, `"2h"`) | The preview URL. **Put it in your reply to the user.** |
| `list_previews` | — | Active preview URLs for the current repo+branch. |
| `stop_preview` | — | Tears down the current repo+branch preview. |

`pugloo mcp` auto-loads gateway config from `~/.pugloo/preview.env`, so no env
wiring is needed in the MCP client config. Register it per-project so its working
directory is the project root:

```bash
claude mcp add pugloo -- pugloo mcp
```

Or add to a project `.mcp.json`:

```json
{ "mcpServers": { "pugloo": { "command": "pugloo", "args": ["mcp"] } } }
```

**Workflow for the agent:** make sure the dev server is running → call
`create_preview` → paste the returned URL in your reply. Same repo+branch always
yields the same URL, so it's safe to call again after you push more changes.

## CLI contract

`pugloo preview --json` writes exactly one JSON object to stdout and exits with a
documented code. Human-facing text (without `--json`) goes to stderr.

Success (schema 1):

```json
{
  "schema": 1,
  "url": "https://myrepo-feat-login-ab12cd.preview.example.com",
  "expires": "2026-06-15T09:00:00.000Z",
  "port": 3000,
  "branch": "feat/login",
  "rebound": false,
  "stability": "machine",
  "share_hint": "Include this URL in your reply so the reviewer can open it.",
  "transport": "frp",
  "subdomain": "myrepo-feat-login-ab12cd"
}
```

- `stability`: `"account"` when `PUGLOO_TOKEN` is set (URL is stable across
  machines and CI sandboxes), else `"machine"` (stable per machine).
- `rebound: true` means the existing URL was repointed to a new port.
- `sibling_of` appears when another service on this repo+branch already holds the
  primary URL (a new sibling URL is allocated instead of stealing it).

Error object: `{ "schema": 1, "error": "PUGLOO_ERR_*", "message": "...", "hint": "..." }`.

### Exit codes

| Code | Name | Meaning | What to do |
|---|---|---|---|
| 0 | — | success | read `url` from stdout |
| 1 | `PUGLOO_ERR_INTERNAL` | unexpected error | report it |
| 2 | — | bad flags/args (usage) | fix the invocation |
| 3 | `PUGLOO_ERR_NO_PORT` | no/ambiguous dev server | pass `--port` (see `candidates`) |
| 4 | `PUGLOO_ERR_PORT_CLOSED` | nothing listening on that port | start the dev server |
| 5 | `PUGLOO_ERR_GATEWAY` | relay unreachable | re-run `pugloo preview` (idempotent) |
| 6 | `PUGLOO_ERR_DAEMON` | runner/daemon failure | `pugloo doctor` |
| 7 | `PUGLOO_ERR_SUBDOMAIN` | name taken / not owner | pass `--name` |
| 8 | `PUGLOO_ERR_AUTH` | bad token / quota | `pugloo login` |

### Commands

```bash
pugloo preview --json            # auto-detect port, create/return the URL
pugloo preview --json --port 3000 --ttl 2h
pugloo preview --json --stop     # tear down this repo+branch preview
```

Re-running with the same repo+branch is idempotent: same URL, refreshed expiry.
Without a gateway configured (`PUGLOO_FRP_*`), preview uses the built-in
WebSocket tunnel as a fallback.
