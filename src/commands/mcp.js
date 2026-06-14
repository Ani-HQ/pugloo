import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { startMcpServer } from "../mcp-server.js";

/**
 * Load ~/.pugloo/preview.env (shell `export KEY=value` lines) into process.env
 * without overriding values already set. Lets an agent run `pugloo mcp` with
 * zero env wiring — the gateway config from the env file is picked up
 * automatically.
 */
function loadPreviewEnv() {
  const file = join(homedir(), ".pugloo", "preview.env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function pkgVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version;
  } catch {
    return "0.0.0";
  }
}

const mcpCommand = new Command("mcp")
  .description("Run pugloo as an MCP server so coding agents can create previews natively (stdio)")
  .action(async () => {
    loadPreviewEnv();
    await startMcpServer({ version: pkgVersion() });
    process.exit(0);
  });

export default mcpCommand;
