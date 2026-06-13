import type { HubSpotTokenResponse } from "./types";

/**
 * HubSpot OAuth 2.0 authorization-code flow.
 *
 * Authorize:  https://app.hubspot.com/oauth/authorize
 * Token:      POST https://api.hubapi.com/oauth/v1/token
 *             Content-Type: application/x-www-form-urlencoded
 */
export const AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
export const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

export type FetchLike = typeof fetch;

export interface AuthorizeParams {
  clientId: string;
  scopes: string; // space-separated
  redirectUri: string;
  state: string;
}

/**
 * Build the HubSpot authorize URL. Scopes and other values are percent-encoded
 * (spaces as %20) to match HubSpot's expected encoding for the scope param.
 */
export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const query = [
    `client_id=${encodeURIComponent(params.clientId)}`,
    `scope=${encodeURIComponent(params.scopes)}`,
    `redirect_uri=${encodeURIComponent(params.redirectUri)}`,
    `state=${encodeURIComponent(params.state)}`,
  ].join("&");
  return `${AUTHORIZE_URL}?${query}`;
}

export class OAuthError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`HubSpot OAuth error ${status}`);
    this.name = "OAuthError";
  }
}

export interface ExchangeParams {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}

export async function exchangeCodeForTokens(
  params: ExchangeParams,
  fetchImpl: FetchLike = fetch,
): Promise<HubSpotTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  return postToken(body, fetchImpl);
}

export interface RefreshParams {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function refreshAccessToken(
  params: RefreshParams,
  fetchImpl: FetchLike = fetch,
): Promise<HubSpotTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
  });
  return postToken(body, fetchImpl);
}

async function postToken(
  body: URLSearchParams,
  fetchImpl: FetchLike,
): Promise<HubSpotTokenResponse> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new OAuthError(res.status, detail);
  }
  const json = (await res.json()) as HubSpotTokenResponse;
  if (!json.access_token || !json.refresh_token || !json.expires_in) {
    throw new OAuthError(res.status, "incomplete token response");
  }
  return json;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

export interface TokenInfo {
  hub_id: number;
  user?: string;
  scopes?: string[];
  token_type?: string;
  expires_in?: number;
  app_id?: number;
}

/**
 * Look up metadata for an access token, including the HubSpot portal/hub id.
 * GET https://api.hubapi.com/oauth/v1/access-tokens/{token}
 */
export async function getTokenInfo(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<TokenInfo> {
  const res = await fetchImpl(
    `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new OAuthError(res.status, await safeText(res));
  }
  return (await res.json()) as TokenInfo;
}
