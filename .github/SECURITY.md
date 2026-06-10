# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via [GitHub Security Advisories](https://github.com/Ani-HQ/pugloo/security/advisories/new). Do not open a public issue.

You can expect an acknowledgment within 72 hours. Please include reproduction steps and the affected version.

## Supported versions

Only the latest published npm release receives security fixes.

## Scope notes for researchers

pugloo touches several security-sensitive surfaces by design:

- **Local certificate authority**: a root CA is generated in `~/.pugloo/` and may be trusted in the system keychain via `pugloo trust`. The CA private key never leaves the machine; file permission issues or key exposure are in scope.
- **/etc/hosts modification**: commands that map local domains edit `/etc/hosts` under sudo. Writes are restricted to pugloo-managed entries; any way to escape that boundary is in scope.
- **Reverse proxy daemon**: a local daemon listens on ports 10443/10080 and routes to localhost targets. Request smuggling, header injection, or routing escapes are in scope.
- **Public tunnels** (`pugloo share`): exposing a local port publicly is inherently dangerous and the user's explicit choice; reports about the tunnel transport, authentication, or subdomain handling are in scope.

Abuse reports for tunnel URLs (phishing or malware served through a tunnel) are also welcome through the same channel.
