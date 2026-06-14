# Control plane — accounts, tokens, quotas (design)

Status: SCOPING (not built). Today the gateway is gated by one shared frp
`auth.token`, so "open signup" is really "everyone shares one secret." This doc
scopes the smallest real accounts system that lets strangers sign up, get their
own token, and be quota'd and bannable — without it, you can't safely drop the
shared token.

## Goal & non-goals

**Goal:** a developer (or their agent) signs up, gets a personal `PUGLOO_TOKEN`,
and `pugloo preview` works against the hosted gateway with per-account quotas,
stable subdomain ownership, and a way to ban abusers.

**Non-goals (v1):** billing/paid tiers, teams/orgs, a fancy dashboard, multi-region.
Keep it one small service + one Postgres DB next to the existing gateway VM.

## Why the current shape can't do it

- frp uses a single static `auth.token` for everyone — no per-user identity,
  no per-user revocation, no quotas.
- `services/control-plane` is a 501 stub designed for stateless Cloud Run; it has
  no datastore and isn't wired to frp.

The unlock is **frp server plugins**: frps can call an HTTP service on each
control operation (`Login`, `NewProxy`, `NewUserConn`, `Ping`) and that service
decides allow/deny. The control plane *becomes* that plugin. No fork of frp.

## Architecture

```
  signup (web/GitHub OAuth) ─────────────► control-plane ──► Postgres
                                                 ▲   │            (accounts,
   pugloo preview                                │   │             tokens,
     └─ frpc --metadata token=<PUGLOO_TOKEN> ──► frps ──HTTP hook──┘ claims,
            (per-account token, not shared)      (server plugin)     usage, bans)
                                                 │
                                  on NewProxy: validate token, check quota,
                                  enforce subdomain ownership → allow/deny
```

- **frps server plugin** (frps.toml `[[httpPlugins]]`): on `Login` validate the
  token in client metadata → account; on `NewProxy` check the account's quota +
  subdomain ownership → allow/deny; on `CloseProxy` record usage. This is the
  whole enforcement point — no gateway logic lives in the CLI (can't trust it).
- **Auth carrier:** the CLI already generates an ed25519 keypair
  (`src/identity.js`) and supports `PUGLOO_TOKEN`. The token becomes the account
  credential, passed to frpc as proxy metadata. `getOwner()` already keys URL
  stability off the token — so account tokens give stable URLs for free.

## Signup & tokens

Pick **GitHub OAuth** as the primary path (the users are developers; it's near
zero-friction and gives weak sybil resistance via account age), with **email
magic-link** as a fallback. Both mint a long-lived **API token** (`pgl_…`) shown
once; the user puts it in `~/.pugloo/preview.env` as `PUGLOO_TOKEN`.

Headless/CI: the same token works as an env var — no browser needed after first
issue. A `pugloo login` command can run the OAuth/device flow and write the token.

## Data model (Postgres)

```
accounts(id, kind[github|email], external_id, email, created_at, banned_at, tier)
api_tokens(id, account_id, token_hash, name, created_at, last_used_at, revoked_at)
subdomain_claims(subdomain PK, account_id, created_at, last_used_at)   -- ownership
usage(id, account_id, subdomain, started_at, ended_at, bytes_in, bytes_out)
signups_by_ip(ip, day, count)   -- sybil throttle
```

Store only token *hashes*. Subdomain ownership = first-claim-wins, bound to
account; idle claims (e.g. 30 days) expire and free the name.

## Quotas & abuse (tiers)

| Tier | Concurrent tunnels | Max TTL | Bandwidth/day | Custom subdomain |
|---|---|---|---|---|
| anonymous (no token) | 1 | 1h | 200 MB | no (random name) |
| free (verified account) | 3 | 24h | 5 GB | yes (claim names) |

Enforcement points:
- **Concurrent/ownership:** frps `NewProxy` hook (control-plane checks DB).
- **Bandwidth:** frps `CloseProxy`/`NewUserConn` reporting → `usage`, with a
  daily cap check on `NewProxy`. (Caddy access logs are a cross-check.)
- **Sybil:** GitHub-account-age + email verification + per-IP signup throttle
  (`signups_by_ip`). Anonymous tier keyed by **IP**, not pubkey (pubkeys are
  free to regenerate).
- **Ban:** set `accounts.banned_at`; `Login`/`NewProxy` hooks reject. One row,
  instant kill — better than the current "restart frps to drop everyone."

## Migration path (each phase ships independently)

1. **Phase 1 — token issuance (no UI):** control-plane + Postgres + frps plugin;
   `pugloo login` device-flow mints a token; anonymous tier (IP-keyed) keeps
   working. Drops the shared secret. *(largest phase; ~1 wk human / ~1.5 d CC)*
2. **Phase 2 — GitHub OAuth + signup page** on `pugloo.ani.computer/signup`;
   email fallback; account tier quotas. *(~3 d / ~0.5 d CC)*
3. **Phase 3 — usage metering + ban tooling + a minimal `/me` dashboard.**
   *(~3 d / ~0.5 d CC)*

PSL note: once strangers hold subdomains under a vanity domain, submit it to the
Public Suffix List. The current launch sidesteps this by serving public previews
on sslip.io (already on the PSL).

## Tech choices

- **DB:** Postgres on **Neon** (serverless, free tier, already available via the
  Neon MCP) — fits both a VM and Cloud Run. SQLite is tempting but the
  control-plane wants to stay stateless/restartable.
- **Service:** extend `services/control-plane/server.js` (Node, no framework
  needed for ~6 routes + 4 frp-hook endpoints). Run it on the existing gateway
  VM (same box as frps/Caddy) to start; split out later if needed.
- **Secrets:** OAuth client secret + DB URL in the VM environment, never in git.

## Open questions for review

1. GitHub OAuth only, or email magic-link from day one? (OAuth is faster to ship
   and more sybil-resistant; email is more inclusive.)
2. Keep an anonymous tier at all, or require signup for any hosted use? (Anonymous
   is great onboarding but the main abuse vector.)
3. Run control-plane on the gateway VM (simple) vs Cloud Run + Neon (scales,
   matches the old infra) — start simple, revisit at load.
