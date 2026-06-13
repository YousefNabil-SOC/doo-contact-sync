import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { json } from "@/lib/http/responses";
import {
  exchangeCodeForTokens,
  getTokenInfo,
  OAuthError,
} from "@/lib/hubspot/oauth";
import { storeTokens } from "@/lib/hubspot/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "hs_oauth_state";

/**
 * GET /api/oauth/callback - HubSpot redirect target.
 * Verifies state (CSRF), exchanges the code for tokens, looks up the portal id,
 * and stores tokens at rest. Never logs tokens.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const env = getEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    logger.warn("oauth_provider_error", { error: oauthError });
    return json({ error: "oauth_error", detail: oauthError }, 400);
  }

  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return json({ error: "invalid_state" }, 401);
  }

  try {
    const tokens = await exchangeCodeForTokens({
      clientId: env.HUBSPOT_CLIENT_ID,
      clientSecret: env.HUBSPOT_CLIENT_SECRET,
      redirectUri: env.HUBSPOT_REDIRECT_URI,
      code,
    });
    const info = await getTokenInfo(tokens.access_token);
    const portalId = BigInt(info.hub_id);
    await storeTokens(portalId, tokens, info.scopes?.join(" "));
    logger.info("oauth_connected", { portalId: portalId.toString() });

    const res = NextResponse.json({
      connected: true,
      portalId: portalId.toString(),
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    const status = err instanceof OAuthError ? 502 : 500;
    logger.error("oauth_callback_failed", {
      status,
      message: err instanceof Error ? err.message : "unknown",
    });
    return json({ error: "oauth_exchange_failed" }, status);
  }
}
