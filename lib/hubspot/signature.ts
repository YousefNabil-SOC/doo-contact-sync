import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HubSpot webhook request signature verification (v3).
 *
 * Per HubSpot docs, the v3 signature is:
 *   base64( HMAC-SHA256( key = app client secret,
 *                        data = HTTP_method + full_URI + request_body + timestamp ) )
 * delivered in the `X-HubSpot-Signature-v3` header, with the request timestamp
 * (milliseconds) in `X-HubSpot-Request-Timestamp`. Requests whose timestamp is
 * older than 5 minutes must be rejected. Comparison must be constant-time.
 */

export const SIGNATURE_HEADER = "x-hubspot-signature-v3";
export const TIMESTAMP_HEADER = "x-hubspot-request-timestamp";
export const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 300000

export interface V3VerifyInput {
  method: string;
  uri: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  clientSecret: string;
  /** Injectable clock for tests. Defaults to Date.now(). */
  now?: number;
  /** Override staleness tolerance (ms). Defaults to MAX_TIMESTAMP_AGE_MS. */
  toleranceMs?: number;
}

export type VerifyReason =
  | "ok"
  | "missing_signature"
  | "missing_timestamp"
  | "bad_timestamp"
  | "stale_timestamp"
  | "signature_mismatch";

export interface VerifyResult {
  valid: boolean;
  reason: VerifyReason;
}

/** Compute the expected base64 v3 signature for a request. */
export function computeV3Signature(
  clientSecret: string,
  method: string,
  uri: string,
  body: string,
  timestamp: string,
): string {
  const base = `${method}${uri}${body}${timestamp}`;
  return createHmac("sha256", clientSecret).update(base, "utf8").digest("base64");
}

export function verifyV3Signature(input: V3VerifyInput): VerifyResult {
  if (!input.signature) return { valid: false, reason: "missing_signature" };
  if (!input.timestamp) return { valid: false, reason: "missing_timestamp" };

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: "bad_timestamp" };

  const now = input.now ?? Date.now();
  const tolerance = input.toleranceMs ?? MAX_TIMESTAMP_AGE_MS;
  if (Math.abs(now - ts) > tolerance) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const expected = computeV3Signature(
    input.clientSecret,
    input.method,
    input.uri,
    input.body,
    input.timestamp,
  );

  if (!constantTimeEquals(expected, input.signature)) {
    return { valid: false, reason: "signature_mismatch" };
  }
  return { valid: true, reason: "ok" };
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
