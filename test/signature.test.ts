import { describe, it, expect } from "vitest";
import {
  computeV3Signature,
  verifyV3Signature,
} from "@/lib/hubspot/signature";

const SECRET = "test-client-secret";
const METHOD = "POST";
const URI = "https://connector.example.com/api/webhooks/hubspot";
const BODY = '[{"eventId":1,"subscriptionType":"contact.creation","objectId":42}]';

function signedAt(ts: number): string {
  return computeV3Signature(SECRET, METHOD, URI, BODY, String(ts));
}

describe("HubSpot v3 signature verification", () => {
  it("accepts a valid, fresh signature", () => {
    const now = 1_000_000_000_000;
    const ts = now - 1000;
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: String(ts),
      signature: signedAt(ts),
      clientSecret: SECRET,
      now,
    });
    expect(result).toEqual({ valid: true, reason: "ok" });
  });

  it("rejects a tampered body", () => {
    const now = 1_000_000_000_000;
    const ts = now - 1000;
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY + "tampered",
      timestamp: String(ts),
      signature: signedAt(ts),
      clientSecret: SECRET,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects the wrong secret", () => {
    const now = 1_000_000_000_000;
    const ts = now - 1000;
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: String(ts),
      signature: computeV3Signature("other-secret", METHOD, URI, BODY, String(ts)),
      clientSecret: SECRET,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a stale timestamp (> 5 minutes)", () => {
    const now = 1_000_000_000_000;
    const ts = now - (5 * 60 * 1000 + 1);
    const result = verifyV3Signature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: String(ts),
      signature: signedAt(ts),
      clientSecret: SECRET,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("stale_timestamp");
  });

  it("rejects missing signature or timestamp", () => {
    expect(
      verifyV3Signature({
        method: METHOD,
        uri: URI,
        body: BODY,
        timestamp: "123",
        signature: null,
        clientSecret: SECRET,
      }).reason,
    ).toBe("missing_signature");
    expect(
      verifyV3Signature({
        method: METHOD,
        uri: URI,
        body: BODY,
        timestamp: null,
        signature: "abc",
        clientSecret: SECRET,
      }).reason,
    ).toBe("missing_timestamp");
  });
});
