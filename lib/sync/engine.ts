import { logger } from "@/lib/logger";
import type { ContactFields } from "@/lib/hubspot/types";
import { contentHash, isEcho } from "./hash";
import {
  hubSpotToFields,
  localToHubSpotProperties,
  parseHubSpotUpdatedAt,
  resolveConflict,
} from "./mapping";
import type { LocalContact, SyncPorts } from "./ports";

/**
 * Two-way sync engine.
 *
 * Loop prevention: every successful sync records `lastSyncedHash` (the content
 * hash of the synced field set). Before applying a change in either direction
 * we compare the incoming hash to `lastSyncedHash`; an equal hash means the
 * change is an echo of our own prior write and is skipped.
 *
 * Conflict resolution: last-write-wins by update timestamp (documented).
 */

export type SyncOutcome = "CREATE" | "UPDATE" | "DELETE" | "SKIP";

export interface SyncResult {
  outcome: SyncOutcome;
  localId: string | null;
  hubspotId: string | null;
  detail?: string;
}

function fieldsOf(c: LocalContact): ContactFields {
  return {
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
  };
}

/** Local change -> push to HubSpot. Idempotent via the echo guard. */
export async function outboundSync(
  ports: SyncPorts,
  localId: string,
): Promise<SyncResult> {
  const now = ports.now ?? (() => new Date());
  const contact = await ports.repo.findById(localId);
  if (!contact) {
    return { outcome: "SKIP", localId, hubspotId: null, detail: "not_found" };
  }

  const fields = fieldsOf(contact);
  const hash = contentHash(fields);

  if (isEcho(hash, contact.lastSyncedHash)) {
    await ports.ledger.record({
      direction: "OUTBOUND",
      localId,
      hubspotId: contact.hubspotObjectId,
      action: "SKIP",
      status: "SKIPPED",
      contentHash: hash,
      detail: "echo_guard",
    });
    return {
      outcome: "SKIP",
      localId,
      hubspotId: contact.hubspotObjectId,
      detail: "echo_guard",
    };
  }

  const properties = localToHubSpotProperties(fields);
  try {
    let hubspotId = contact.hubspotObjectId;
    let action: "CREATE" | "UPDATE";
    if (hubspotId) {
      await ports.gateway.update(hubspotId, properties);
      action = "UPDATE";
    } else {
      const created = await ports.gateway.create(properties);
      hubspotId = created.id;
      action = "CREATE";
    }

    await ports.repo.update(localId, {
      hubspotObjectId: hubspotId,
      lastSyncedHash: hash,
      lastSyncedAt: now(),
    });
    await ports.ledger.record({
      direction: "OUTBOUND",
      localId,
      hubspotId,
      action,
      status: "SUCCESS",
      contentHash: hash,
    });
    return { outcome: action, localId, hubspotId };
  } catch (err) {
    await ports.ledger.record({
      direction: "OUTBOUND",
      localId,
      hubspotId: contact.hubspotObjectId,
      action: contact.hubspotObjectId ? "UPDATE" : "CREATE",
      status: "FAILED",
      contentHash: hash,
      detail: errorDetail(err),
    });
    throw err;
  }
}

export interface InboundChange {
  hubspotId: string;
  type: "creation" | "propertyChange" | "deletion";
  portalId?: bigint;
}

/** HubSpot change -> upsert into the local store. Echo + conflict aware. */
export async function inboundUpsert(
  ports: SyncPorts,
  change: InboundChange,
): Promise<SyncResult> {
  const now = ports.now ?? (() => new Date());

  if (change.type === "deletion") {
    const existing = await ports.repo.findByHubspotId(change.hubspotId);
    if (existing && !existing.deleted) {
      await ports.repo.update(existing.id, { deleted: true });
    }
    await ports.ledger.record({
      direction: "INBOUND",
      hubspotId: change.hubspotId,
      localId: existing?.id ?? null,
      action: "DELETE",
      status: "SUCCESS",
      contentHash: null,
    });
    return {
      outcome: existing ? "DELETE" : "SKIP",
      localId: existing?.id ?? null,
      hubspotId: change.hubspotId,
    };
  }

  const remote = await ports.gateway.get(change.hubspotId);
  if (!remote || remote.archived) {
    // Treated as a delete: the object is gone/archived in HubSpot.
    const existing = await ports.repo.findByHubspotId(change.hubspotId);
    if (existing && !existing.deleted) {
      await ports.repo.update(existing.id, { deleted: true });
    }
    return {
      outcome: existing ? "DELETE" : "SKIP",
      localId: existing?.id ?? null,
      hubspotId: change.hubspotId,
      detail: "remote_absent",
    };
  }

  const fields = hubSpotToFields(remote);
  const hash = contentHash(fields);
  const remoteUpdatedAt = parseHubSpotUpdatedAt(remote);

  const existing =
    (await ports.repo.findByHubspotId(change.hubspotId)) ??
    (fields.email ? await ports.repo.findByEmail(fields.email) : null);

  if (existing) {
    if (isEcho(hash, existing.lastSyncedHash)) {
      await ports.ledger.record({
        direction: "INBOUND",
        hubspotId: change.hubspotId,
        localId: existing.id,
        action: "SKIP",
        status: "SKIPPED",
        contentHash: hash,
        detail: "echo_guard",
      });
      return {
        outcome: "SKIP",
        localId: existing.id,
        hubspotId: change.hubspotId,
        detail: "echo_guard",
      };
    }

    const winner = resolveConflict(existing.updatedAt, remoteUpdatedAt);
    if (winner === "local") {
      await ports.ledger.record({
        direction: "INBOUND",
        hubspotId: change.hubspotId,
        localId: existing.id,
        action: "SKIP",
        status: "SKIPPED",
        contentHash: hash,
        detail: "local_newer",
      });
      return {
        outcome: "SKIP",
        localId: existing.id,
        hubspotId: change.hubspotId,
        detail: "local_newer",
      };
    }

    await ports.repo.update(existing.id, {
      ...fields,
      hubspotObjectId: change.hubspotId,
      lastSyncedHash: hash,
      lastSyncedAt: now(),
      deleted: false,
    });
    await ports.ledger.record({
      direction: "INBOUND",
      hubspotId: change.hubspotId,
      localId: existing.id,
      action: "UPDATE",
      status: "SUCCESS",
      contentHash: hash,
    });
    return { outcome: "UPDATE", localId: existing.id, hubspotId: change.hubspotId };
  }

  const created = await ports.repo.create({
    ...fields,
    hubspotObjectId: change.hubspotId,
    portalId: change.portalId ?? null,
    lastSyncedHash: hash,
    lastSyncedAt: now(),
  });
  await ports.ledger.record({
    direction: "INBOUND",
    hubspotId: change.hubspotId,
    localId: created.id,
    action: "CREATE",
    status: "SUCCESS",
    contentHash: hash,
  });
  return { outcome: "CREATE", localId: created.id, hubspotId: change.hubspotId };
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  logger.error("unknown_sync_error", { err: String(err) });
  return "unknown_error";
}
