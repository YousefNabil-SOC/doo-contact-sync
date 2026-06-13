import type { SyncAction, SyncDirection, SyncStatus } from "@prisma/client";
import type { ContactFields, HubSpotContact } from "@/lib/hubspot/types";

/**
 * Ports (interfaces) the sync engine depends on. Production wires these to
 * Prisma and the HubSpot client; tests inject in-memory fakes. This keeps the
 * engine pure of I/O details and fully unit-testable.
 */

export interface LocalContact extends ContactFields {
  id: string;
  hubspotObjectId: string | null;
  portalId: bigint | null;
  version: number;
  lastSyncedHash: string | null;
  lastSyncedAt: Date | null;
  deleted: boolean;
  updatedAt: Date;
}

export type ContactWrite = Partial<ContactFields> & {
  hubspotObjectId?: string | null;
  portalId?: bigint | null;
  lastSyncedHash?: string | null;
  lastSyncedAt?: Date | null;
  deleted?: boolean;
  version?: number;
};

export interface ContactRepo {
  findById(id: string): Promise<LocalContact | null>;
  findByHubspotId(hubspotId: string): Promise<LocalContact | null>;
  findByEmail(email: string): Promise<LocalContact | null>;
  create(data: ContactWrite): Promise<LocalContact>;
  update(id: string, data: ContactWrite): Promise<LocalContact>;
  listActive(limit: number): Promise<LocalContact[]>;
}

export interface LedgerEntry {
  direction: SyncDirection;
  hubspotId: string | null;
  localId: string | null;
  action: SyncAction;
  status: SyncStatus;
  contentHash: string | null;
  detail?: string | null;
}

export interface LedgerRepo {
  record(entry: LedgerEntry): Promise<void>;
}

export interface ContactGateway {
  create(properties: Record<string, string>): Promise<HubSpotContact>;
  update(
    id: string,
    properties: Record<string, string>,
  ): Promise<HubSpotContact>;
  get(id: string): Promise<HubSpotContact | null>;
  delete(id: string): Promise<void>;
  list(
    after?: string,
    limit?: number,
  ): Promise<{ results: HubSpotContact[]; after?: string }>;
}

export interface SyncPorts {
  repo: ContactRepo;
  ledger: LedgerRepo;
  gateway: ContactGateway;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}
