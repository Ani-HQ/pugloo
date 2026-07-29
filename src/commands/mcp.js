import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startMcpServer } from "../mcp-server.js";
import { applyPreviewEnv } from "../gateway.js";

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
    applyPreviewEnv();
    await startMcpServer({ version: pkgVersion() });
    process.exit(0);
  });

export default mcpCommand;
