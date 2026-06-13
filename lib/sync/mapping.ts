import type { ContactFields, HubSpotContact } from "@/lib/hubspot/types";

/**
 * Field mapping between the local contact store and HubSpot CRM contacts, plus
 * conflict resolution. Pure functions - no I/O - so they are fully unit-tested.
 *
 * HubSpot contact property names: email, firstname, lastname, phone.
 */
export const HUBSPOT_CONTACT_PROPERTIES = [
  "email",
  "firstname",
  "lastname",
  "phone",
  "lastmodifieddate",
] as const;

/** Build the HubSpot `properties` payload from local fields (omit nulls). */
export function localToHubSpotProperties(
  fields: ContactFields,
): Record<string, string> {
  const props: Record<string, string> = {};
  if (fields.email != null) props.email = fields.email;
  if (fields.firstName != null) props.firstname = fields.firstName;
  if (fields.lastName != null) props.lastname = fields.lastName;
  if (fields.phone != null) props.phone = fields.phone;
  return props;
}

/** Extract our normalized field set from a HubSpot contact object. */
export function hubSpotToFields(contact: HubSpotContact): ContactFields {
  const p = contact.properties ?? {};
  return {
    email: emptyToNull(p.email),
    firstName: emptyToNull(p.firstname),
    lastName: emptyToNull(p.lastname),
    phone: emptyToNull(p.phone),
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.length > 0 ? value : null;
}

export type ConflictWinner = "local" | "remote" | "equal";

/**
 * Last-write-wins by update timestamp. When timestamps are equal we report
 * "equal" so the caller can no-op rather than thrash.
 */
export function resolveConflict(
  localUpdatedAt: Date,
  remoteUpdatedAt: Date,
): ConflictWinner {
  const local = localUpdatedAt.getTime();
  const remote = remoteUpdatedAt.getTime();
  if (local === remote) return "equal";
  return local > remote ? "local" : "remote";
}

/** Parse HubSpot's hs_lastmodifieddate / updatedAt into a Date (epoch fallback). */
export function parseHubSpotUpdatedAt(contact: HubSpotContact): Date {
  const raw =
    contact.properties?.lastmodifieddate ?? contact.updatedAt ?? null;
  if (!raw) return new Date(0);
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && raw.trim() !== "") {
    return new Date(asNumber);
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? new Date(0) : new Date(parsed);
}
