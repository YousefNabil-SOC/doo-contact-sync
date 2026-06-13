import { HubSpotClient } from "@/lib/hubspot/client";
import { getValidAccessToken } from "@/lib/hubspot/tokens";
import { logger } from "@/lib/logger";
import { buildSyncPorts } from "./adapters";
import { outboundSync } from "./engine";
import type { SyncPorts } from "./ports";

/**
 * Build live sync ports backed by a valid (auto-refreshed) access token.
 * Returns null when no HubSpot portal is connected yet.
 */
export async function activeSyncPorts(
  portalId?: bigint,
): Promise<SyncPorts | null> {
  const token = await getValidAccessToken(portalId);
  if (!token) return null;
  return buildSyncPorts(new HubSpotClient({ accessToken: token.accessToken }));
}

export interface OutboundPushResult {
  status: "synced" | "skipped_no_connection" | "sync_failed";
  outcome?: string;
  detail?: string;
}

/** Push a local contact outbound, no-op if no portal is connected. */
export async function pushContactOutbound(
  localId: string,
): Promise<OutboundPushResult> {
  const ports = await activeSyncPorts();
  if (!ports) return { status: "skipped_no_connection" };
  try {
    const result = await outboundSync(ports, localId);
    return { status: "synced", outcome: result.outcome, detail: result.detail };
  } catch (err) {
    logger.error("outbound_sync_failed", {
      localId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return { status: "sync_failed" };
  }
}
