# pugloo preview gateway

The public relay that turns `pugloo preview` into a real HTTPS URL. This is the
**wrap-an-existing-core** approach from the design plan: a single small VM
running [frp](https://github.com/fatedier/frp) (the tunnel transport) behind
[Caddy](https://caddyserver.com) (automatic Let's Encrypt TLS). pugloo owns the
naming, identity, and JSON contract on top; frp owns the pipe.

```
  agent → pugloo preview          reviewer browser
        → frpc (PUGLOO_FRP_*)            │ https://<sub>.<ip>.sslip.io
        → frps :7000 ───────────────────┤
                                         ▼
                       Caddy :443 (on-demand Let's Encrypt)
                                         │ reverse_proxy
                                         ▼
                       frps vhost :8080 ── routes by Host subdomain
                                         ▼
                       frpc → localhost:<port> on the dev machine
```

## Why this shape

- **No DNS dependency.** Hostnames use [sslip.io](https://sslip.io)
  (`<anything>.<ip>.sslip.io` resolves to `<ip>`), so a preview is
  `https://pugloo-feat-login-abc123.34.122.152.105.sslip.io` with a real,
  browser-trusted cert and zero DNS records to manage. Swapping in a vanity
  domain later (`*.preview.example.com`) is just one wildcard DNS record
  pointing at the VM plus an `email`/host tweak in the Caddyfile — the rest is
  unchanged.
- **No wildcard cert needed.** Caddy's on-demand TLS issues a per-hostname
  Let's Encrypt cert on first request (TLS-ALPN-01 on :443), gated by the
  `ask` endpoint so only `*.<ip>.sslip.io` hosts can trigger issuance.
- **Cloud Run can't do this.** Wildcard / arbitrary-subdomain custom domains
  and raw TCP (frp control port) need a VM, not Cloud Run — which is why the
  old `infra/gcp` Cloud Run path was abandoned for previews.

## Provision

```bash
# sslip.io mode — zero DNS, works immediately:
PROJECT=my-gcp-project ./setup-gateway.sh

# vanity-domain mode — create *.preview.example.com -> the VM IP first:
PROJECT=my-gcp-project DOMAIN=preview.example.com EMAIL=you@example.com ./setup-gateway.sh
```

The script reserves a static IP, opens the firewall (7000/80/443), and creates
an `e2-micro` VM whose startup script installs frps + Caddy from the templates
here. It prints the client env block to paste into `~/.pugloo/preview.env`.
The frp auth token is generated on the VM and printed once — keep it secret
(it controls who can open tunnels). It is never committed.

Set `DOMAIN` to use a vanity wildcard host (`https://<sub>.$DOMAIN`); you must
first create a wildcard DNS record `*.$DOMAIN` -> the VM's static IP (grey-cloud
/ DNS-only if behind Cloudflare). Without `DOMAIN`, previews use sslip.io and
need no DNS records at all. The live instance for this repo runs with
`DOMAIN=preview.ani.computer`.

## Use it

```bash
source ~/.pugloo/preview.env     # PUGLOO_FRP_SERVER / _DOMAIN / _TOKEN / _BIN
pugloo preview --json            # → https://<sub>.<ip>.sslip.io
```

Without `PUGLOO_FRP_*` set, `pugloo preview` falls back to the built-in
WebSocket tunnel transport.

## Running it open to the public

If strangers will create previews through your gateway, you become a public
tunnel relay. Protect yourself:

- **Shield your brand domain.** Serve public/anonymous previews on **sslip.io**,
  not a subdomain of your primary domain. One bad actor's content can get a
  domain flagged by Safe Browsing; on sslip.io that risk isn't yours. This also
  sidesteps the **Public Suffix List** requirement — sslip.io is already on the
  PSL (cookie isolation + per-host blocklist scope). If you must use a vanity
  domain for public traffic, submit it to the PSL first
  (<https://github.com/publicsuffix/list>) — that takes weeks.
- **Cost.** Set a GCP billing budget + alert on the project. egress is the main
  cost on an open relay.
- **Abuse.** Publish an acceptable-use policy (see `docs/acceptable-use.md`),
  keep the gateway's notice page pointing at a report channel, and keep
  `maxPortsPerClient` set in `frps.toml`.
- **Kill switch.** `scripts/gateway-ops.sh disable|stop` takes the gateway
  offline fast if something goes wrong.
- **Vanity bare host.** The notice block in `Caddyfile.tmpl` needs a cert for
  the bare `$DOMAIN`; with a wildcard-only DNS record (`*.$DOMAIN`) the apex has
  no A record, so either add a bare `$DOMAIN` A record or remove that block.

The token gate (`auth.token`) means the gateway is not truly "open" until you
hand the token out. Real per-user accounts/quotas need the control-plane
(`services/control-plane`), which is not built yet — until then, treat a shared
token as the only gate.

## Files

- `setup-gateway.sh` — one-shot provisioner (idempotent: re-running reuses the IP/VM).
- `frps.toml.tmpl` — frp server config (`__SUBDOMAIN_HOST__`/`__TOKEN__` filled at boot).
- `Caddyfile.tmpl` — Caddy on-demand-TLS reverse proxy (`__SUBDOMAIN_HOST__`/`__EMAIL__` filled at boot).
- `../../scripts/gateway-ops.sh` — operate/kill the running gateway.

- `setup-gateway.sh` — one-shot provisioner (idempotent: re-running reuses the IP/VM).
- `frps.toml.tmpl` — frp server config (`__SUBDOMAIN_HOST__`/`__TOKEN__` filled at boot).
- `Caddyfile.tmpl` — Caddy on-demand-TLS reverse proxy (`__SUBDOMAIN_HOST__`/`__EMAIL__` filled at boot).
