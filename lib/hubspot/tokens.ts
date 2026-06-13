import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { refreshAccessToken } from "./oauth";
import type { HubSpotTokenResponse } from "./types";
import {
  decodeKey,
  decryptToken,
  encryptToken,
  isEncrypted,
} from "@/lib/crypto/token-cipher";

/**
 * Token manager: stores HubSpot tokens at rest and returns a valid access
 * token, transparently refreshing it shortly before expiry. HubSpot access
 * tokens last ~30 minutes; we refresh with a safety skew.
 */
export const DEFAULT_SKEW_MS = 60_000;

/** Pure: is the token expired or within the refresh skew window? */
export function needsRefresh(
  expiresAt: Date,
  now: number = Date.now(),
  skewMs: number = DEFAULT_SKEW_MS,
): boolean {
  return expiresAt.getTime() - skewMs <= now;
}

/** Pure: compute the absolute expiry from a token response. */
export function expiresAtFromResponse(
  expiresInSeconds: number,
  now: number = Date.now(),
): Date {
  return new Date(now + expiresInSeconds * 1000);
}

function encryptField(token: string): { value: string; encrypted: boolean } {
  const key = decodeKey(getEnv().TOKEN_ENCRYPTION_KEY);
  if (!key) return { value: token, encrypted: false };
  return { value: encryptToken(token, key), encrypted: true };
}

function decryptField(stored: string, encrypted: boolean): string {
  if (!encrypted && !isEncrypted(stored)) return stored;
  const key = decodeKey(getEnv().TOKEN_ENCRYPTION_KEY);
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is required to read encrypted tokens at rest",
    );
  }
  return decryptToken(stored, key);
}

export async function storeTokens(
  portalId: bigint,
  tok: HubSpotTokenResponse,
  scopes?: string,
): Promise<void> {
  const access = encryptField(tok.access_token);
  const refresh = encryptField(tok.refresh_token);
  if (!access.encrypted) {
    logger.warn("token_encryption_disabled", {
      hint: "set TOKEN_ENCRYPTION_KEY to encrypt tokens at rest",
    });
  }
  const expiresAt = expiresAtFromResponse(tok.expires_in);
  const data = {
    accessToken: access.value,
    refreshToken: refresh.value,
    expiresAt,
    scopes: scopes ?? null,
    tokenType: tok.token_type ?? "bearer",
    encrypted: access.encrypted,
  };
  await prisma.connection.upsert({
    where: { portalId },
    create: { portalId, ...data },
    update: data,
  });
}

export interface ActiveToken {
  accessToken: string;
  portalId: bigint;
}

export async function getValidAccessToken(
  portalId?: bigint,
): Promise<ActiveToken | null> {
  const conn =
    portalId != null
      ? await prisma.connection.findUnique({ where: { portalId } })
      : await prisma.connection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!conn) return null;

  let accessToken = decryptField(conn.accessToken, conn.encrypted);

  if (needsRefresh(conn.expiresAt)) {
    const env = getEnv();
    const tok = await refreshAccessToken({
      clientId: env.HUBSPOT_CLIENT_ID,
      clientSecret: env.HUBSPOT_CLIENT_SECRET,
      refreshToken: decryptField(conn.refreshToken, conn.encrypted),
    });
    await storeTokens(conn.portalId, tok, conn.scopes ?? undefined);
    accessToken = tok.access_token;
    logger.info("token_refreshed", { portalId: conn.portalId.toString() });
  }

  return { accessToken, portalId: conn.portalId };
}

export interface ConnectionStatus {
  connected: boolean;
  portalId: string | null;
  expiresAt: string | null;
  expired: boolean;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const conn = await prisma.connection.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!conn) {
    return { connected: false, portalId: null, expiresAt: null, expired: true };
  }
  return {
    connected: true,
    portalId: conn.portalId.toString(),
    expiresAt: conn.expiresAt.toISOString(),
    expired: conn.expiresAt.getTime() <= Date.now(),
  };
}
