import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "@/lib/prisma";
import { getConnectionStatus } from "@/lib/hubspot/tokens";
import { prismaContactRepo } from "@/lib/sync/adapters";
import { activeSyncPorts } from "@/lib/sync/runtime";
import type { SyncPorts } from "@/lib/sync/ports";
import { ContactCreateSchema } from "@/lib/validation";
import {
  createContact,
  findContact,
  getSyncStatus,
  syncNow,
  type LocalAndSyncDeps,
  type StatusReaders,
} from "@/lib/services/connector-service";

/**
 * MCP tools wrapping the connector. Every handler validates input with zod,
 * returns a structured result, and NEVER throws to the client (always returns
 * a CallToolResult, so a calling agent never hangs). Handlers take their
 * dependencies as arguments so they are unit-testable with in-memory fakes;
 * registerTools wires them to production (Prisma + HubSpot).
 */

// ---- result helpers (BigInt-safe serialization) ----
function toText(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}
function okResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: toText(data) }] };
}
function errorResult(error: string, detail?: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: toText({ error, detail }) }],
    isError: true,
  };
}
function message(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

// ---- input schemas (raw shapes for tool registration) ----
export const createShape = {
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  phone: z.string().min(1).max(64).optional(),
};
export const findShape = { email: z.string().email() };
export const syncShape = {
  maxPages: z.number().int().min(1).max(50).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
};
export const statusShape = { limit: z.number().int().min(1).max(50).optional() };

const FindSchema = z.object(findShape);
const SyncSchema = z.object(syncShape);
const StatusSchema = z.object(statusShape);

// ---- handlers (dependency-injected, never throw) ----
export async function handleCreateContact(
  deps: LocalAndSyncDeps,
  args: unknown,
): Promise<CallToolResult> {
  const parsed = ContactCreateSchema.safeParse(args);
  if (!parsed.success) {
    return errorResult("validation_failed", parsed.error.flatten());
  }
  try {
    const result = await createContact(deps, {
      email: parsed.data.email ?? null,
      firstName: parsed.data.firstName ?? null,
      lastName: parsed.data.lastName ?? null,
      phone: parsed.data.phone ?? null,
    });
    return okResult(result);
  } catch (err) {
    return errorResult("internal_error", message(err));
  }
}

export async function handleFindContact(
  deps: LocalAndSyncDeps,
  args: unknown,
): Promise<CallToolResult> {
  const parsed = FindSchema.safeParse(args);
  if (!parsed.success) {
    return errorResult("validation_failed", parsed.error.flatten());
  }
  try {
    return okResult(await findContact(deps, parsed.data.email));
  } catch (err) {
    return errorResult("internal_error", message(err));
  }
}

export async function handleSyncNow(
  ports: SyncPorts | null,
  args: unknown,
): Promise<CallToolResult> {
  const parsed = SyncSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult("validation_failed", parsed.error.flatten());
  }
  try {
    const result = await syncNow(ports, parsed.data);
    if (!result.connected) {
      return errorResult(
        "no_connection",
        "connect a HubSpot portal first (GET /api/oauth/start)",
      );
    }
    return okResult(result);
  } catch (err) {
    return errorResult("sync_failed", message(err));
  }
}

export async function handleGetSyncStatus(
  readers: StatusReaders,
  args: unknown,
): Promise<CallToolResult> {
  const parsed = StatusSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult("validation_failed", parsed.error.flatten());
  }
  try {
    return okResult(await getSyncStatus(readers, parsed.data.limit ?? 10));
  } catch (err) {
    return errorResult("internal_error", message(err));
  }
}

// ---- production dependency wiring ----
async function prodDeps(): Promise<LocalAndSyncDeps> {
  return { repo: prismaContactRepo, ports: await activeSyncPorts() };
}

export const prodStatusReaders: StatusReaders = {
  connectionStatus: getConnectionStatus,
  counts: async () => ({
    contacts: await prisma.contact.count({ where: { deleted: false } }),
    ledgerEntries: await prisma.syncLedger.count(),
  }),
  recentLedger: async (limit) => {
    const rows = await prisma.syncLedger.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      direction: r.direction,
      action: r.action,
      status: r.status,
      hubspotId: r.hubspotId,
      localId: r.localId,
      contentHash: r.contentHash,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));
  },
};

export const TOOL_NAMES = [
  "create_contact",
  "find_contact",
  "sync_now",
  "get_sync_status",
] as const;

/** Register all four tools on an McpServer with production dependencies. */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "create_contact",
    {
      title: "Create contact",
      description:
        "Create a contact in the local DOO store and sync it to HubSpot.",
      inputSchema: createShape,
    },
    async (args) => handleCreateContact(await prodDeps(), args),
  );

  server.registerTool(
    "find_contact",
    {
      title: "Find contact by email",
      description:
        "Look up a contact by email in the local store, then HubSpot.",
      inputSchema: findShape,
    },
    async (args) => handleFindContact(await prodDeps(), args),
  );

  server.registerTool(
    "sync_now",
    {
      title: "Sync now",
      description: "Reconcile contacts between the local store and HubSpot.",
      inputSchema: syncShape,
    },
    async (args) => handleSyncNow((await prodDeps()).ports, args),
  );

  server.registerTool(
    "get_sync_status",
    {
      title: "Get sync status",
      description:
        "Return connection status, counts, and recent sync-ledger entries.",
      inputSchema: statusShape,
    },
    async (args) => handleGetSyncStatus(prodStatusReaders, args),
  );
}
