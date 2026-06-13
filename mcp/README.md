# DOO Contact Sync - MCP Server

An [MCP](https://modelcontextprotocol.io) server (stdio transport) that exposes
the Phase 1 connector's actions as tools an AI coding agent (Claude Code,
Cursor, Codex) can call directly. This is the DOO Builders League "Level 2 / MCP
Servers" deliverable.

All business logic is **reused** from the connector - `lib/services` and
`lib/sync` - the server only wires the MCP transport to those functions. Built
with `@modelcontextprotocol/sdk` v1 and zod.

## Tools

| Tool | Input | Returns |
| ---- | ----- | ------- |
| `create_contact` | `email?`, `firstName?`, `lastName?`, `phone?` (at least one) | created local contact + outbound sync result |
| `find_contact` | `email` (required) | `{ source: "local" \| "hubspot" \| "none", contact }` |
| `sync_now` | `maxPages?` (1-50), `pageSize?` (1-100) | reconcile summary, or `no_connection` error |
| `get_sync_status` | `limit?` (1-50, default 10) | connection status, counts, recent sync-ledger entries |

Every tool:
- has a typed zod input schema (advertised to the client),
- validates input and returns a structured `{ error, detail }` with `isError`
  on bad input,
- never throws to the client - it ALWAYS returns a `CallToolResult`, so a
  calling agent never hangs,
- serializes BigInt safely.

## Requirements

The server reuses the connector, so it needs the same environment as Phase 1
(loaded automatically from the project-root `.env.local`):
`HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI`,
`DATABASE_URL`, `DIRECT_URL` (see the root README). `create_contact` works
locally even with no portal connected (the outbound push is then skipped);
`sync_now` returns `no_connection` until a portal is connected via
`GET /api/oauth/start`.

## Run

```bash
npm run mcp:build      # bundle to mcp/dist/server.mjs (tsup; resolves @/ aliases)
npm run mcp:start      # node mcp/dist/server.mjs  (loads .env.local itself)
# or, no build step, for development:
npm run mcp:dev        # tsx mcp/server.ts via dotenv-cli
```

The server speaks JSON-RPC over **stdout**; all logs go to **stderr** (the
logger is forced to stderr and dotenv's banner is silenced) so the protocol
channel is never polluted.

## Register with an MCP client

The server finds the project root (and `.env.local`) by walking up from its own
location, so it works regardless of the client's working directory.

### Claude Code
```bash
claude mcp add doo-contact-sync -- node D:\DOO-League-application\mcp\dist\server.mjs
```

### Claude Desktop (claude_desktop_config.json)
```json
{
  "mcpServers": {
    "doo-contact-sync": {
      "command": "node",
      "args": ["D:\\DOO-League-application\\mcp\\dist\\server.mjs"]
    }
  }
}
```

### Cursor (.cursor/mcp.json)
```json
{
  "mcpServers": {
    "doo-contact-sync": {
      "command": "node",
      "args": ["D:\\DOO-League-application\\mcp\\dist\\server.mjs"]
    }
  }
}
```

After registering, the client lists four tools: `create_contact`,
`find_contact`, `sync_now`, `get_sync_status`.

## Tests

`test/mcp-tools.test.ts` covers input validation for every tool plus happy
paths (create + sync via in-memory fakes, find local + HubSpot fallback,
no-connection handling). Run `npm test`.

## Files

```
mcp/server.ts          entrypoint: load env -> create McpServer -> register -> stdio
mcp/tools.ts           tool handlers (DI, never throw) + production wiring
mcp/bootstrap-env.ts   loads .env.local and forces logs to stderr
tsup.config.ts         bundles mcp/server.ts -> mcp/dist/server.mjs
lib/services/connector-service.ts   shared logic (also used by the HTTP routes)
```
