# pugloo

Local HTTPS dev proxy CLI built with Node.js (ES modules).

## Project structure

- `bin/pugloo.js` - CLI entry point
- `src/commands/` - Individual CLI commands (map, unmap, up, down, list, share, status, start, stop, trust)
- `src/` - Core modules (proxy, certs, hosts, ports, store, config, daemon, tunnel, colors)
- `docs/` - Landing page (deployed to pugloo.ani.computer via Cloudflare Pages)

## Git workflow

- **Never commit directly to `main`.** Create a feature branch for every change.
- Branch naming: `feat/<name>`, `fix/<name>`, `chore/<name>`, `docs/<name>`
- Write clear, concise commit messages. Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Keep commits small and focused. One logical change per commit.
- Push the branch and open a PR to `main`. Do not merge without review.
- Do not add `Co-Authored-By` lines to commits.

## Code conventions

- ES modules (`import`/`export`), not CommonJS
- Use `node:` protocol for built-in modules (e.g., `node:fs`, `node:path`)
- Colors/symbols via `src/colors.js`, no external chalk/ora deps
- State lives in `~/.pugloo/`
- CLI output should be colorful and user-friendly with check/cross/arrow symbols

## Deployment

- npm package: `pugloo` (v0.1.0)
- Landing page: https://pugloo.ani.computer (auto-deploys from `docs/` on push to `main`)
- GitHub: https://github.com/Ani-HQ/pugloo
