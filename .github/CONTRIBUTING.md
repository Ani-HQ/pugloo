# Contributing to pugloo

Thanks for helping make pugloo better. This guide keeps contributions fast to review and easy to merge.

## Development setup

```bash
git clone https://github.com/Ani-HQ/pugloo.git
cd pugloo
npm ci
node bin/pugloo.js --help
```

Requirements: Node.js >= 18, macOS or Linux.

## Running tests

```bash
npm test
```

Tests use the built-in `node --test` runner. New code should come with tests, especially anything touching the JSON output contract, exit codes, or routing logic.

## Workflow

1. Branch off `main`: `feat/<name>`, `fix/<name>`, `chore/<name>`, or `docs/<name>`.
2. Keep commits small and focused, using conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
3. Open a PR against `main`. CI must pass (tests on macOS and Linux, Node 18/20/22).
4. Never commit directly to `main`.

## Code conventions

- ES modules with the `node:` protocol for built-ins (`node:fs`, `node:path`).
- No new runtime dependencies without prior discussion in an issue — colors and symbols come from `src/colors.js`, not chalk/ora.
- State lives in `~/.pugloo/`.
- Machine-readable output: commands that support `--json` must write JSON only to stdout (human-facing color goes to stderr) and exit with documented codes.
- Keep files under 500 lines.

## Reporting bugs and proposing features

Use the issue templates. For bugs, include the output of `pugloo doctor` (or `pugloo status`), your OS, and Node version.

## Security issues

Do not open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
