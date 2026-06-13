import { json } from "@/lib/http/responses";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { getConnectionStatus } from "@/lib/hubspot/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health - service, config, database, and token status. */
export async function GET(): Promise<Response> {
  const checks = { config: false, database: false, token: false };
  let configError: string | undefined;
  let connection: Awaited<ReturnType<typeof getConnectionStatus>> | null = null;

  try {
    getEnv();
    checks.config = true;
  } catch (err) {
    configError = err instanceof Error ? err.message : "invalid config";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    connection = await getConnectionStatus();
    checks.token = connection.connected && !connection.expired;
  } catch {
    connection = null;
  }

  const healthy = checks.config && checks.database;
  return json(
    {
      status: healthy ? "ok" : "degraded",
      checks,
      connection,
      ...(configError ? { configError } : {}),
      time: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
}
