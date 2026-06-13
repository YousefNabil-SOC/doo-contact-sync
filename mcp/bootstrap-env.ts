import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Side-effect module imported FIRST by the MCP server entrypoint.
 *
 * 1. The MCP stdio transport uses stdout for the protocol, so all logs must go
 *    to stderr - set the flag the logger honors before anything logs.
 * 2. Next.js auto-loads .env.local, but this server runs standalone, so we load
 *    it ourselves. We walk up from the module location to the project root
 *    (works whether run from mcp/ via tsx or mcp/dist via node) and also fall
 *    back to the current working directory.
 */
process.env.LOG_TO_STDERR = "1";

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = findRoot(here);

for (const candidate of [
  resolve(root, ".env.local"),
  resolve(process.cwd(), ".env.local"),
  resolve(root, ".env"),
]) {
  // quiet:true suppresses dotenv's banner - stdout is the MCP protocol channel.
  if (existsSync(candidate)) config({ path: candidate, quiet: true });
}
