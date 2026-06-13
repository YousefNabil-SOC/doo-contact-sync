import type { HubSpotContact } from "@/lib/hubspot/types";
import type {
  ContactGateway,
  ContactRepo,
  ContactWrite,
  LedgerEntry,
  LedgerRepo,
  LocalContact,
} from "@/lib/sync/ports";

/** In-memory test doubles for the sync ports. No I/O, fully deterministic. */

export class FakeGateway implements ContactGateway {
  store = new Map<string, HubSpotContact>();
  createCalls = 0;
  updateCalls = 0;
  private seq = 1;
  private clock = 1000;

  private tick(): string {
    this.clock += 1000;
    return String(this.clock);
  }

  async create(properties: Record<string, string>): Promise<HubSpotContact> {
    this.createCalls += 1;
    const id = String(this.seq++);
    const c: HubSpotContact = {
      id,
      properties: { ...properties, lastmodifieddate: this.tick() },
      archived: false,
    };
    this.store.set(id, c);
    return c;
  }

  async update(
    id: string,
    properties: Record<string, string>,
  ): Promise<HubSpotContact> {
    this.updateCalls += 1;
    const existing = this.store.get(id);
    const c: HubSpotContact = {
      id,
      properties: {
        ...(existing?.properties ?? {}),
        ...properties,
        lastmodifieddate: this.tick(),
      },
      archived: false,
    };
    this.store.set(id, c);
    return c;
  }

  async get(id: string): Promise<HubSpotContact | null> {
    return this.store.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async list(): Promise<{ results: HubSpotContact[]; after?: string }> {
    return { results: [...this.store.values()] };
  }

  async searchByEmail(email: string): Promise<HubSpotContact | null> {
    for (const c of this.store.values()) {
      if (c.properties?.email === email) return c;
    }
    return null;
  }

  /** Seed a remote contact directly (simulating a HubSpot-origin record). */
  seed(id: string, properties: Record<string, string>): HubSpotContact {
    const c: HubSpotContact = { id, properties, archived: false };
    this.store.set(id, c);
    return c;
  }
}

function strip(data: ContactWrite): Partial<LocalContact> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<LocalContact>;
}

export class FakeRepo implements ContactRepo {
  rows = new Map<string, LocalContact>();
  private seq = 1;
  clockVal = new Date("2026-01-01T00:00:00.000Z");

  async findById(id: string): Promise<LocalContact | null> {
    return this.rows.get(id) ?? null;
  }
  async findByHubspotId(hubspotId: string): Promise<LocalContact | null> {
    for (const r of this.rows.values()) {
      if (r.hubspotObjectId === hubspotId) return r;
    }
    return null;
  }
  async findByEmail(email: string): Promise<LocalContact | null> {
    for (const r of this.rows.values()) {
      if (r.email === email) return r;
    }
    return null;
  }
  async create(data: ContactWrite): Promise<LocalContact> {
    const id = `L${this.seq++}`;
    const row: LocalContact = {
      id,
      email: data.email ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      phone: data.phone ?? null,
      hubspotObjectId: data.hubspotObjectId ?? null,
      portalId: data.portalId ?? null,
      version: 1,
      lastSyncedHash: data.lastSyncedHash ?? null,
      lastSyncedAt: data.lastSyncedAt ?? null,
      deleted: data.deleted ?? false,
      updatedAt: this.clockVal,
    };
    this.rows.set(id, row);
    return row;
  }
  async update(id: string, data: ContactWrite): Promise<LocalContact> {
    const cur = this.rows.get(id);
    if (!cur) throw new Error(`no row ${id}`);
    const upd: LocalContact = {
      ...cur,
      ...strip(data),
      version: cur.version + 1,
      updatedAt: this.clockVal,
    };
    this.rows.set(id, upd);
    return upd;
  }
  async listActive(limit: number): Promise<LocalContact[]> {
    return [...this.rows.values()].filter((r) => !r.deleted).slice(0, limit);
  }
}

export class FakeLedger implements LedgerRepo {
  entries: LedgerEntry[] = [];
  async record(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
  }
}
