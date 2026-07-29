# Control plane — accounts, tokens, quotas (design)

Status: Phases 1–2 SHIPPED and live on the gateway VM (per-client tokens via
frps plugin hook, GitHub OAuth signup, anonymous + free tiers, fail-closed
NewProxy). Phase 3 (usage metering, revoke/ban API, `/me`) is designed below
but NOT built — the tier table's bandwidth caps are not enforced yet, and
server-side TTL enforcement is still missing. Historical scoping context
follows unchanged.

## Goal & non-goals

**Goal:** a developer (or their agent) signs up, gets a personal `PUGLOO_TOKEN`,
and `pugloo preview` works against the hosted gateway with per-account quotas,
stable subdomain ownership, and a way to ban abusers.

**Non-goals (v1):** billing/paid tiers, teams/orgs, a fancy dashboard, multi-region.
Keep it one small service + one Postgres DB next to the existing gateway VM.

## Why the current shape can't do it

- (Pre-Phase-1) frp used a single static `auth.token` for everyone — no
  per-user identity, no per-user revocation, no quotas.
- (Pre-Phase-1) `services/control-plane` was a 501 stub designed for stateless
  Cloud Run; it had no datastore and wasn't wired to frp.

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

- **frps server plugin** (frps.toml `[[httpPlugins]]`, ops `Login`/`NewProxy`/`CloseProxy`):
  on `Login` validate the token in client metadata → account; on `NewProxy` check
  the account's quota + subdomain ownership → allow/deny; on `CloseProxy` release
  the claim. This is the whole enforcement point — no gateway logic lives in the
  CLI (can't trust it). Verified the op set + metadata passing against frp docs.
- **Auth carrier:** the CLI already generates an ed25519 keypair
  (`src/identity.js`) and supports `PUGLOO_TOKEN`. The token becomes the account
  credential, passed to frpc as client metadata. `getOwner()` already keys URL
  stability off the token — so account tokens give stable URLs for free.

### Hot-path & failure stance (locked in eng review)

The `Login`/`NewProxy` hooks are **synchronous in tunnel establishment** — every
preview blocks on an HTTP call to the control-plane → DB. Therefore:

- **Co-locate** the control-plane with frps on the gateway VM; the hook is a
  loopback call (sub-ms), not a cross-service round trip. This is why Phase 1 is
  VM + SQLite, not Cloud Run + a network DB (cold starts would add seconds to
  every preview).
- **Fail-closed on quota:** if the control-plane or DB errors, `NewProxy`
  **denies** the tunnel rather than silently allowing it un-quota'd. A short hook
  timeout (~1s) bounds the stall. (Critical test — see test plan.)
- **TLS the control connection:** enable frp `transport.tls.enable` so the token
  in client metadata is not plaintext on the frpc→frps wire.

## Signup & tokens

**GitHub OAuth only** (decided in eng review). The users are developers; GitHub
is one click and gives weak sybil resistance via account age. Email magic-link is
deferred until non-GitHub demand shows up — adding it now doubles the auth surface
and pulls in email deliverability for no proven need. OAuth mints a long-lived
**API token** (`pgl_…`) shown once; the user puts it in `~/.pugloo/preview.env`
as `PUGLOO_TOKEN`.

Headless/CI: the same token works as an env var — no browser needed after first
issue. `pugloo login` runs the OAuth **device flow** (no local web server needed)
and writes the token to `~/.pugloo/preview.env`.

## Data model (SQLite in Phase 1; Postgres when multi-gateway)

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
- **Bandwidth:** meter from **frps Prometheus metrics** (per-proxy traffic
  counters), not the `CloseProxy` hook — that hook isn't guaranteed to carry byte
  counts. A small poller writes `usage`; the daily cap is checked on `NewProxy`.
- **Sybil:** GitHub account-age + per-IP signup throttle (`signups_by_ip`). The
  **anonymous tier is keyed by IP** (and IP+pubkey), never pubkey alone — pubkeys
  are free to regenerate, so key-only quotas are decorative.
- **Ban:** set `accounts.banned_at`; `Login`/`NewProxy` hooks reject. One row,
  instant kill — better than the current "restart frps to drop everyone."

## Migration path (each phase ships independently)

1. **Phase 1 — token issuance (no UI):** control-plane (Node) + SQLite + frps
   plugin, co-located on the gateway VM; `pugloo login` device-flow mints a
   token; anonymous tier (IP-keyed) keeps working; fail-closed `NewProxy`; frp
   control-conn TLS. Drops the shared secret. *(largest phase; ~1 wk human / ~1.5 d CC)*
2. **Phase 2 — GitHub OAuth + signup page** on `pugloo.ani.computer/signup`;
   account-tier quotas. (Email magic-link deferred.) *(~3 d / ~0.5 d CC)*
3. **Phase 3 — usage metering (Prometheus poller) + ban tooling + a minimal
   `/me` dashboard.** *(~3 d / ~0.5 d CC)*

PSL note: once strangers hold subdomains under a vanity domain, submit it to the
Public Suffix List. The current launch sidesteps this by serving public previews
on sslip.io (already on the PSL).

## Tech choices

- **DB:** **SQLite** on the gateway VM for Phase 1 — the `NewProxy` hook is on
  the hot path, so a loopback file DB beats a network DB. Migrate to Postgres
  (Neon) only when you run more than one gateway and need a shared store.
- **Service:** extend `services/control-plane/server.js` (Node, no framework
  needed for ~6 routes + the frp-hook endpoint). Runs on the gateway VM beside
  frps/Caddy.
- **Secrets:** OAuth client secret in the VM environment, never in git.

## Decisions (locked via /plan-eng-review, 2026-06-14)

1. **Signup:** GitHub OAuth only; email magic-link deferred.
2. **Anonymous tier:** kept, but small and IP-keyed (1 tunnel / 1h / low
   bandwidth) — the zero-signup first preview is the product's whole pitch.
3. **Hosting/DB:** control-plane co-located with frps on the gateway VM, SQLite
   for Phase 1 (Cloud Run + Neon only once multi-gateway).
4. **Hot path:** `NewProxy` is fail-closed on quota with a ~1s timeout; frp
   control connection runs with TLS so the token isn't plaintext.
5. **Metering:** from frps Prometheus metrics, not the CloseProxy hook.

## Test plan (Phase 1 — must ship with the code)

frp-plugin handler (`Login`/`NewProxy`/`CloseProxy`):
- Login: valid token → account; anonymous (no token) → allowed + IP marked;
  revoked/unknown token → reject; banned account → reject.
- NewProxy: under quota → allow; over concurrent limit → deny with clear message;
  subdomain owned by another account → deny; free subdomain → claim + allow.
- **CRITICAL (fail-closed):** control-plane/DB error on NewProxy → deny, never
  silent-allow. Regression-class; no skipping.
- CloseProxy: claim released / usage row closed.

`pugloo login` device flow: mints a token, hashes it at rest, writes
`~/.pugloo/preview.env`. Quota: 2nd anonymous tunnel from one IP → denied;
account at limit → denied. Sybil: regenerating the keypair does NOT reset the
anonymous quota (IP-keyed).
