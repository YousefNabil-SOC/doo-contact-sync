import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for tokens at rest.
 *
 * Stored format: "v1:" + base64(iv) + ":" + base64(authTag) + ":" + base64(ct)
 * The key is a 32-byte value supplied via TOKEN_ENCRYPTION_KEY (base64). When
 * no key is configured the caller stores tokens as-is (and logs a warning);
 * this module is only invoked when a valid key exists.
 */
const PREFIX = "v1";
const IV_BYTES = 12; // 96-bit nonce, recommended for GCM

export function decodeKey(keyB64: string | undefined): Buffer | null {
  if (!keyB64) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(keyB64, "base64");
  } catch {
    return null;
  }
  return buf.length === 32 ? buf : null;
}

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function decryptToken(payload: string, key: Buffer): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("malformed encrypted token");
  }
  const iv = Buffer.from(parts[1] as string, "base64");
  const tag = Buffer.from(parts[2] as string, "base64");
  const ct = Buffer.from(parts[3] as string, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}
