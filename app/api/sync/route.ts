import type { NextRequest } from "next/server";
import { json, ok, badRequest } from "@/lib/http/responses";
import { logger } from "@/lib/logger";
import { SyncRequestSchema } from "@/lib/validation";
import { activeSyncPorts } from "@/lib/sync/runtime";
import { reconcile } from "@/lib/sync/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/sync - reconcile both sides on demand. */
export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown = undefined;
  const text = await req.text();
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return badRequest("invalid_json");
    }
  }

  const parsed = SyncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("validation_failed", parsed.error.flatten());
  }

  const ports = await activeSyncPorts();
  if (!ports) {
    return json({ error: "no_connection" }, 409);
  }

  try {
    const summary = await reconcile(ports, parsed.data ?? {});
    return ok({ status: "ok", summary });
  } catch (err) {
    logger.error("reconcile_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return json({ error: "reconcile_failed" }, 502);
  }
}
