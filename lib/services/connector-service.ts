import type { ContactFields } from "@/lib/hubspot/types";
import { outboundSync } from "@/lib/sync/engine";
import { hubSpotToFields } from "@/lib/sync/mapping";
import { reconcile, type ReconcileOptions, type ReconcileSummary } from "@/lib/sync/reconcile";
import type { ContactRepo, LocalContact, SyncPorts } from "@/lib/sync/ports";

/**
 * Connector service: the single source of business logic shared by the HTTP
 * routes (Phase 1) and the MCP server (Phase 2). Dependencies are injected
 * (a local ContactRepo plus optional live SyncPorts) so the same code runs
 * against Prisma + HubSpot in production and against in-memory fakes in tests.
 */

export interface LocalAndSyncDeps {
  /** Local store, always available (Prisma in prod, fake in tests). */
  repo: ContactRepo;
  /** Live sync ports (gateway) or null when no HubSpot portal is connected. */
  ports: SyncPorts | null;
}

export type OutboundStatus =
  | "synced"
  | "skipped_no_connection"
  | "sync_failed";

export interface CreateContactResult {
  contact: LocalContact;
  sync: { status: OutboundStatus; outcome?: string; detail?: string };
}

/** Create a local contact, then push it outbound if a portal is connected. */
export async function createContact(
  deps: LocalAndSyncDeps,
  fields: ContactFields,
): Promise<CreateContactResult> {
  const repo = deps.ports?.repo ?? deps.repo;
  const contact = await repo.create(fields);

  if (!deps.ports) {
    return { contact, sync: { status: "skipped_no_connection" } };
  }
  try {
    const result = await outboundSync(deps.ports, contact.id);
    return {
      contact: (await repo.findById(contact.id)) ?? contact,
      sync: { status: "synced", outcome: result.outcome, detail: result.detail },
    };
  } catch {
    return { contact, sync: { status: "sync_failed" } };
  }
}

export interface FindContactResult {
  source: "local" | "hubspot" | "none";
  contact: (ContactFields & { id?: string; hubspotObjectId?: string | null }) | null;
}

/** Find a contact by email: local store first, then HubSpot if connected. */
export async function findContact(
  deps: LocalAndSyncDeps,
  email: string,
): Promise<FindContactResult> {
  const local = await deps.repo.findByEmail(email);
  if (local && !local.deleted) {
    return { source: "local", contact: local };
  }
  if (deps.ports) {
    const remote = await deps.ports.gateway.searchByEmail(email);
    if (remote) {
      return {
        source: "hubspot",
        contact: { ...hubSpotToFields(remote), hubspotObjectId: remote.id },
      };
    }
  }
  return { source: "none", contact: null };
}

export interface SyncNowResult {
  connected: boolean;
  summary?: ReconcileSummary;
}

/** Reconcile both sides on demand. Returns connected:false if no portal. */
export async function syncNow(
  ports: SyncPorts | null,
  opts: ReconcileOptions = {},
): Promise<SyncNowResult> {
  if (!ports) return { connected: false };
  const summary = await reconcile(ports, opts);
  return { connected: true, summary };
}

export interface LedgerView {
  direction: string;
  action: string;
  status: string;
  hubspotId: string | null;
  localId: string | null;
  contentHash: string | null;
  detail: string | null;
  createdAt: string;
}

export interface StatusReaders {
  connectionStatus: () => Promise<{
    connected: boolean;
    portalId: string | null;
    expiresAt: string | null;
    expired: boolean;
  }>;
  recentLedger: (limit: number) => Promise<LedgerView[]>;
  counts: () => Promise<{ contacts: number; ledgerEntries: number }>;
}

export interface SyncStatusResult {
  connection: Awaited<ReturnType<StatusReaders["connectionStatus"]>>;
  counts: { contacts: number; ledgerEntries: number };
  recent: LedgerView[];
}

/** Recent sync activity + connection status, for observability/agents. */
export async function getSyncStatus(
  readers: StatusReaders,
  limit: number,
): Promise<SyncStatusResult> {
  const [connection, counts, recent] = await Promise.all([
    readers.connectionStatus(),
    readers.counts(),
    readers.recentLedger(limit),
  ]);
  return { connection, counts, recent };
}
