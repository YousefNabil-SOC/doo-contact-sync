import { logger } from "@/lib/logger";

/**
 * Thin HubSpot API client with resilience:
 *  - injects the bearer access token
 *  - honors HTTP 429 (Retry-After header when present) and retries 5xx
 *  - exponential backoff with jitter, bounded retries
 *  - never logs tokens or response bodies that may contain PII verbatim
 */
export const HUBSPOT_API_BASE = "https://api.hubapi.com";

export type FetchLike = typeof fetch;

export interface ClientOptions {
  accessToken: string;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Injectable sleeper for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export class HubSpotApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`HubSpot API error ${status}`);
    this.name = "HubSpotApiError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HubSpotClient {
  private readonly accessToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ClientOptions) {
    this.accessToken = opts.accessToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 5;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${HUBSPOT_API_BASE}${path}`;
    let attempt = 0;

    for (;;) {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        const delay = this.computeDelay(attempt, res);
        logger.warn("hubspot_retry", {
          method,
          path,
          status: res.status,
          attempt,
          delayMs: delay,
        });
        await this.sleep(delay);
        attempt += 1;
        continue;
      }

      const detail = await safeText(res);
      throw new HubSpotApiError(res.status, detail);
    }
  }

  private computeDelay(attempt: number, res: Response): number {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    }
    const expo = this.baseDelayMs * 2 ** attempt;
    const jitter = Math.floor(expo * 0.25 * deterministicJitter(attempt));
    return expo + jitter;
  }
}

/**
 * Jitter factor in [0,1). Avoids Math.random so behavior is reproducible in
 * tests; spreads retries across attempts well enough for backoff purposes.
 */
function deterministicJitter(attempt: number): number {
  const x = Math.sin(attempt + 1) * 10000;
  return x - Math.floor(x);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
