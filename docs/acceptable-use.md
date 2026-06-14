# Acceptable Use Policy — pugloo preview gateway

The hosted pugloo preview gateway relays HTTP(S) traffic from public preview
URLs to a developer's local machine. It is provided as-is, for development and
review, with no uptime or availability guarantee.

## You may not use the gateway to

- Serve phishing, malware, or content that violates any law.
- Host production services or anything resembling permanent hosting.
- Distribute illegal, infringing, or abusive content.
- Attempt to overwhelm, attack, or circumvent limits of the gateway or others' tunnels.
- Relay traffic on behalf of third parties as a general-purpose proxy.

## What we do

- Previews are ephemeral and may be removed or expired at any time, with or
  without notice.
- Abusive tunnels are terminated on report or detection.
- Basic rate and concurrency limits apply and may change without notice.
- We keep minimal operational logs (timestamps, subdomains, byte counts) for
  abuse handling; we do not inspect tunneled content.

## Reporting abuse

Open an issue at <https://github.com/Ani-HQ/pugloo/issues> with the preview URL
and a short description. We aim to act on credible reports promptly.

## No warranty

The gateway is provided "as is" without warranty of any kind. Use at your own
risk. Run your own gateway (`infra/gateway/`) if you need control or guarantees.
