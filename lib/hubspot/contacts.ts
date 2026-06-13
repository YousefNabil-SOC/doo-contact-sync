import { HubSpotClient, HubSpotApiError } from "./client";
import type { HubSpotContact } from "./types";
import { HUBSPOT_CONTACT_PROPERTIES } from "@/lib/sync/mapping";

/** HubSpot CRM v3 contacts operations used by the sync engine. */
const BASE = "/crm/v3/objects/contacts";
const PROPS = HUBSPOT_CONTACT_PROPERTIES.join(",");

export async function createContact(
  client: HubSpotClient,
  properties: Record<string, string>,
): Promise<HubSpotContact> {
  return client.request<HubSpotContact>("POST", BASE, { properties });
}

export async function updateContact(
  client: HubSpotClient,
  id: string,
  properties: Record<string, string>,
): Promise<HubSpotContact> {
  return client.request<HubSpotContact>("PATCH", `${BASE}/${id}`, {
    properties,
  });
}

export async function getContact(
  client: HubSpotClient,
  id: string,
): Promise<HubSpotContact | null> {
  try {
    return await client.request<HubSpotContact>(
      "GET",
      `${BASE}/${id}?properties=${PROPS}&archived=false`,
    );
  } catch (err) {
    if (err instanceof HubSpotApiError && err.status === 404) return null;
    throw err;
  }
}

export async function deleteContact(
  client: HubSpotClient,
  id: string,
): Promise<void> {
  await client.request<void>("DELETE", `${BASE}/${id}`);
}

export interface ContactPage {
  results: HubSpotContact[];
  paging?: { next?: { after?: string } };
}

export async function listContacts(
  client: HubSpotClient,
  after?: string,
  limit = 100,
): Promise<ContactPage> {
  const qs = new URLSearchParams({
    limit: String(limit),
    properties: PROPS,
    archived: "false",
  });
  if (after) qs.set("after", after);
  return client.request<ContactPage>("GET", `${BASE}?${qs.toString()}`);
}
