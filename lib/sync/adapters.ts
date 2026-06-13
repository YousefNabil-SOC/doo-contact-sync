import type { Contact } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { HubSpotClient } from "@/lib/hubspot/client";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  searchContactByEmail,
  updateContact,
} from "@/lib/hubspot/contacts";
import type {
  ContactGateway,
  ContactRepo,
  ContactWrite,
  LedgerRepo,
  LocalContact,
  SyncPorts,
} from "./ports";

/** Map a Prisma Contact row to the engine's LocalContact shape. */
function toLocal(row: Contact): LocalContact {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    hubspotObjectId: row.hubspotObjectId,
    portalId: row.portalId,
    version: row.version,
    lastSyncedHash: row.lastSyncedHash,
    lastSyncedAt: row.lastSyncedAt,
    deleted: row.deleted,
    updatedAt: row.updatedAt,
  };
}

/** Strip undefined keys so Prisma does not try to set columns to undefined. */
function clean(data: ContactWrite): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && k !== "version") out[k] = v;
  }
  return out;
}

export const prismaContactRepo: ContactRepo = {
  async findById(id) {
    const row = await prisma.contact.findUnique({ where: { id } });
    return row ? toLocal(row) : null;
  },
  async findByHubspotId(hubspotId) {
    const row = await prisma.contact.findUnique({
      where: { hubspotObjectId: hubspotId },
    });
    return row ? toLocal(row) : null;
  },
  async findByEmail(email) {
    const row = await prisma.contact.findFirst({ where: { email } });
    return row ? toLocal(row) : null;
  },
  async create(data) {
    const row = await prisma.contact.create({ data: clean(data) });
    return toLocal(row);
  },
  async update(id, data) {
    const row = await prisma.contact.update({
      where: { id },
      data: { ...clean(data), version: { increment: 1 } },
    });
    return toLocal(row);
  },
  async listActive(limit) {
    const rows = await prisma.contact.findMany({
      where: { deleted: false },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toLocal);
  },
};

export const prismaLedgerRepo: LedgerRepo = {
  async record(entry) {
    await prisma.syncLedger.create({
      data: {
        direction: entry.direction,
        hubspotId: entry.hubspotId,
        localId: entry.localId,
        action: entry.action,
        status: entry.status,
        contentHash: entry.contentHash,
        detail: entry.detail ?? null,
      },
    });
  },
};

export function hubspotGateway(client: HubSpotClient): ContactGateway {
  return {
    create: (properties) => createContact(client, properties),
    update: (id, properties) => updateContact(client, id, properties),
    get: (id) => getContact(client, id),
    delete: (id) => deleteContact(client, id),
    async list(after, limit) {
      const page = await listContacts(client, after, limit);
      return { results: page.results, after: page.paging?.next?.after };
    },
    searchByEmail: (email) => searchContactByEmail(client, email),
  };
}

/** Build production sync ports from a valid access token. */
export function buildSyncPorts(
  client: HubSpotClient,
): SyncPorts {
  return {
    repo: prismaContactRepo,
    ledger: prismaLedgerRepo,
    gateway: hubspotGateway(client),
  };
}
