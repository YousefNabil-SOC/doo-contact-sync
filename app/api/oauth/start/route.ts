import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/hubspot/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "hs_oauth_state";

/** GET /api/oauth/start - begin the HubSpot OAuth flow (redirect to authorize). */
export async function GET(): Promise<Response> {
  const env = getEnv();
  const state = randomBytes(16).toString("hex");
  const url = buildAuthorizeUrl({
    clientId: env.HUBSPOT_CLIENT_ID,
    scopes: env.HUBSPOT_SCOPES,
    redirectUri: env.HUBSPOT_REDIRECT_URI,
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
