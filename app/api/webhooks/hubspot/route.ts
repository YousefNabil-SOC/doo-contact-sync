import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { json, ok } from "@/lib/http/responses";
import { prisma } from "@/lib/prisma";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyV3Signature,
} from "@/lib/hubspot/signature";
import type { HubSpotWebhookEvent } from "@/lib/hubspot/types";
import { inboundUpsert, type InboundChange } from "@/lib/sync/engine";
import { activeSyncPorts } from "@/lib/sync/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/hubspot - inbound contact events.
 *
 * The HubSpot v3 signature is verified against the RAW body BEFORE the payload
 * is parsed or trusted. Invalid signatures are rejected with 401. Events are
 * deduplicated by HubSpot eventId.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const env = getEnv();
  const raw = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);
  const timestamp = req.headers.get(TIMESTAMP_HEADER);

  const verification = verifyV3Signature({
    method: "POST",
    uri: `${env.APP_BASE_URL}/api/webhooks/hubspot`,
    body: raw,
    timestamp,
    signature,
    clientSecret: env.HUBSPOT_CLIENT_SECRET,
  });
  if (!verification.valid) {
    logger.warn("webhook_rejected", { reason: verification.reason });
    return json({ error: "invalid_signature" }, 401);
  }

  let events: HubSpotWebhookEvent[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return json({ error: "expected_array" }, 400);
    events = parsed as HubSpotWebhookEvent[];
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const processed: Array<Record<string, unknown>> = [];
  for (const ev of events) {
    processed.push(await handleEvent(ev));
  }
  return ok({ received: events.length, processed });
}

async function handleEvent(
  ev: HubSpotWebhookEvent,
): Promise<Record<string, unknown>> {
  const eventId = BigInt(ev.eventId);

  const seen = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (seen) return { eventId: ev.eventId, status: "duplicate" };

  await prisma.webhookEvent.create({
    data: {
      eventId,
      dedupKey: String(ev.eventId),
      subscriptionType: ev.subscriptionType,
      objectId: ev.objectId != null ? BigInt(ev.objectId) : null,
      portalId: ev.portalId != null ? BigInt(ev.portalId) : null,
      signatureValid: true,
    },
  });

  const ports = await activeSyncPorts(BigInt(ev.portalId));
  if (!ports) return { eventId: ev.eventId, status: "no_connection" };

  const change: InboundChange = {
    hubspotId: String(ev.objectId),
    type: changeType(ev.subscriptionType),
    portalId: BigInt(ev.portalId),
  };
  const result = await inboundUpsert(ports, change);

  await prisma.webhookEvent.update({
    where: { eventId },
    data: { processedAt: new Date() },
  });
  return { eventId: ev.eventId, outcome: result.outcome, detail: result.detail };
}

function changeType(subscriptionType: string): InboundChange["type"] {
  if (subscriptionType.endsWith("creation")) return "creation";
  if (subscriptionType.endsWith("deletion")) return "deletion";
  return "propertyChange";
}
