import { describe, it, expect } from "vitest";
import { contentHash, isEcho, normalizeFields } from "@/lib/sync/hash";
import { resolveConflict, parseHubSpotUpdatedAt } from "@/lib/sync/mapping";
import {
  decodeKey,
  decryptToken,
  encryptToken,
  isEncrypted,
} from "@/lib/crypto/token-cipher";

describe("content hashing + echo guard", () => {
  it("normalizes equal field sets to the same hash regardless of casing/space", () => {
    const a = contentHash({
      email: "Test@Example.com ",
      firstName: " Ada ",
      lastName: "Lovelace",
      phone: "+100",
    });
    const b = contentHash({
      email: "test@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+100",
    });
    expect(a).toBe(b);
  });

  it("produces different hashes for different content", () => {
    const a = contentHash({ email: "a@x.com", firstName: null, lastName: null, phone: null });
    const b = contentHash({ email: "b@x.com", firstName: null, lastName: null, phone: null });
    expect(a).not.toBe(b);
  });

  it("treats empty strings as null after normalization", () => {
    expect(normalizeFields({ email: "", firstName: "  ", lastName: null, phone: "x" })).toEqual({
      email: null,
      firstName: null,
      lastName: null,
      phone: "x",
    });
  });

  it("isEcho only matches a non-null equal hash", () => {
    const h = contentHash({ email: "a@x.com", firstName: null, lastName: null, phone: null });
    expect(isEcho(h, h)).toBe(true);
    expect(isEcho(h, null)).toBe(false);
    expect(isEcho(h, "different")).toBe(false);
  });
});

describe("conflict resolution (last-write-wins)", () => {
  it("local newer wins", () => {
    expect(resolveConflict(new Date(2000), new Date(1000))).toBe("local");
  });
  it("remote newer wins", () => {
    expect(resolveConflict(new Date(1000), new Date(2000))).toBe("remote");
  });
  it("equal timestamps report equal", () => {
    expect(resolveConflict(new Date(1000), new Date(1000))).toBe("equal");
  });
  it("parses HubSpot epoch-millis lastmodifieddate", () => {
    const d = parseHubSpotUpdatedAt({
      id: "1",
      properties: { lastmodifieddate: "1700000000000" },
    });
    expect(d.getTime()).toBe(1700000000000);
  });
});

describe("token cipher (AES-256-GCM) at rest", () => {
  const key = decodeKey(Buffer.alloc(32, 7).toString("base64"));

  it("round-trips encrypt/decrypt", () => {
    expect(key).not.toBeNull();
    const enc = encryptToken("super-secret-token", key!);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("super-secret-token");
    expect(decryptToken(enc, key!)).toBe("super-secret-token");
  });

  it("rejects a non-32-byte key", () => {
    expect(decodeKey(Buffer.alloc(16).toString("base64"))).toBeNull();
    expect(decodeKey(undefined)).toBeNull();
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptToken("x", key!);
    const wrong = decodeKey(Buffer.alloc(32, 9).toString("base64"))!;
    expect(() => decryptToken(enc, wrong)).toThrow();
  });
});
