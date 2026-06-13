import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_SKEW_MS,
  expiresAtFromResponse,
  needsRefresh,
} from "@/lib/hubspot/tokens";
import { refreshAccessToken, TOKEN_URL } from "@/lib/hubspot/oauth";

describe("token expiry logic", () => {
  it("expiresAtFromResponse adds expires_in seconds to now", () => {
    const now = 1_000_000;
    const at = expiresAtFromResponse(1800, now);
    expect(at.getTime()).toBe(now + 1800 * 1000);
  });

  it("needsRefresh is false well before expiry", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now + 30 * 60 * 1000); // 30 min out
    expect(needsRefresh(expiresAt, now)).toBe(false);
  });

  it("needsRefresh is true within the skew window", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now + DEFAULT_SKEW_MS - 1);
    expect(needsRefresh(expiresAt, now)).toBe(true);
  });

  it("needsRefresh is true once expired", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now - 1);
    expect(needsRefresh(expiresAt, now)).toBe(true);
  });
});

describe("refreshAccessToken", () => {
  it("posts a form-encoded refresh_token grant and parses the response", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(TOKEN_URL);
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(body).toContain("grant_type=refresh_token");
      expect(body).toContain("refresh_token=old-refresh");
      expect(body).toContain("client_id=cid");
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 1800,
          token_type: "bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const tok = await refreshAccessToken(
      { clientId: "cid", clientSecret: "secret", refreshToken: "old-refresh" },
      fetchMock as unknown as typeof fetch,
    );
    expect(tok.access_token).toBe("new-access");
    expect(tok.refresh_token).toBe("new-refresh");
    expect(tok.expires_in).toBe(1800);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws OAuthError on a non-200 response", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    await expect(
      refreshAccessToken(
        { clientId: "c", clientSecret: "s", refreshToken: "r" },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow();
  });
});
