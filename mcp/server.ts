// Load env + redirect logs to stderr BEFORE anything else is imported.
import "./bootstrap-env";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";

/**
 * DOO Contact Sync - MCP server (stdio transport).
 *
 * Exposes the Phase 1 connector's actions as tools an AI coding agent (Claude
 * Code, Cursor, Codex) can call directly. All business logic is reused from
 * lib/services and lib/sync - this entrypoint only wires transport + tools.
 */
async function main(): Promise<void> {
  const server = new McpServer({
    name: "doo-contact-sync",
    version: "1.0.0",
  });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only - stdout is the MCP protocol channel.
  process.stderr.write("[doo-mcp] server ready on stdio\n");
}

main().catch((err) => {
  process.stderr.write(
    `[doo-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
