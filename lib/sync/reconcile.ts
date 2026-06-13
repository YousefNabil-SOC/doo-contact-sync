import { contentHash } from "./hash";
import { inboundUpsert, outboundSync, type SyncOutcome } from "./engine";
import type { SyncPorts } from "./ports";

/**
 * On-demand reconciliation of both sides.
 *
 * Outbound pass: push every local contact whose current content hash differs
 * from its last synced hash (the echo guard turns already-synced rows into
 * no-ops). Inbound pass: pull HubSpot contacts (bounded by maxPages) and upsert
 * them locally. Both passes route through the same engine, so loop prevention
 * and conflict resolution apply uniformly.
 */
export interface ReconcileOptions {
  maxPages?: number;
  pageSize?: number;
}

export interface ReconcileSummary {
  outbound: Record<SyncOutcome, number>;
  inbound: Record<SyncOutcome, number>;
}

function emptyCounts(): Record<SyncOutcome, number> {
  return { CREATE: 0, UPDATE: 0, DELETE: 0, SKIP: 0 };
}

export async function reconcile(
  ports: SyncPorts,
  opts: ReconcileOptions = {},
): Promise<ReconcileSummary> {
  const maxPages = opts.maxPages ?? 5;
  const pageSize = opts.pageSize ?? 100;
  const summary: ReconcileSummary = {
    outbound: emptyCounts(),
    inbound: emptyCounts(),
  };

  // Outbound: local -> HubSpot for dirty rows.
  const active = await ports.repo.listActive(pageSize * maxPages);
  for (const c of active) {
    if (c.deleted) continue;
    const hash = contentHash({
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
    });
    if (hash === c.lastSyncedHash) continue;
    const result = await outboundSync(ports, c.id);
    summary.outbound[result.outcome] += 1;
  }

  // Inbound: HubSpot -> local, bounded paging.
  let after: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const { results, after: next } = await ports.gateway.list(after, pageSize);
    for (const remote of results) {
      const result = await inboundUpsert(ports, {
        hubspotId: remote.id,
        type: "propertyChange",
      });
      summary.inbound[result.outcome] += 1;
    }
    if (!next) break;
    after = next;
  }

  return summary;
}
