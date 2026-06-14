# pugloo agent integrations

Drop-in pieces for letting coding agents create preview URLs.

## MCP server

`pugloo mcp` is a stdio MCP server exposing `create_preview`, `list_previews`,
and `stop_preview`. It auto-loads gateway config from `~/.pugloo/preview.env`.

**Claude Code:**
```bash
claude mcp add pugloo -- pugloo mcp
```

**Any MCP client** (project `.mcp.json` or client config): copy `mcp.json` here.
Register it per-project so the server's working directory is the project root
(preview detects the repo, branch, and dev server from the cwd).

## Claude Code skill

`claude-skill/SKILL.md` teaches an agent the workflow ("user wants a preview →
ensure dev server is up → create_preview → reply with the URL"). Install it:

```bash
mkdir -p .claude/skills/preview
cp claude-skill/SKILL.md .claude/skills/preview/SKILL.md
```

The skill works with the MCP tools or the CLI contract. See `../AGENTS.md` for
the full contract.
