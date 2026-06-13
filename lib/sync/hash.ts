import { createHash } from "node:crypto";
import type { ContactFields } from "@/lib/hubspot/types";

/**
 * Deterministic content hashing for contact field sets.
 *
 * The hash is the loop guard and idempotency key: two field sets that are
 * semantically equal (after normalization) produce the same hash regardless of
 * which side they came from, so an inbound change that merely echoes our own
 * outbound write is detected and skipped.
 */
export function normalizeFields(fields: ContactFields): ContactFields {
  return {
    email: normalizeEmail(fields.email),
    firstName: normalizeText(fields.firstName),
    lastName: normalizeText(fields.lastName),
    phone: normalizeText(fields.phone),
  };
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function contentHash(fields: ContactFields): string {
  const n = normalizeFields(fields);
  // Fixed key order so serialization is stable.
  const canonical = JSON.stringify([n.email, n.firstName, n.lastName, n.phone]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** True when an incoming change is just an echo of the last synced state. */
export function isEcho(
  incomingHash: string,
  lastSyncedHash: string | null | undefined,
): boolean {
  return !!lastSyncedHash && incomingHash === lastSyncedHash;
}
