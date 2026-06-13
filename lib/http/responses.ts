/**
 * JSON response helpers for route handlers.
 *
 * Uses a BigInt-safe serializer because HubSpot portal/object/event ids are
 * stored as BigInt in Postgres and would otherwise throw on JSON.stringify.
 */
function bigIntSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, bigIntSafe), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function ok(data: unknown): Response {
  return json(data, 200);
}

export function badRequest(message: string, detail?: unknown): Response {
  return json({ error: message, detail }, 400);
}

export function unauthorized(message = "unauthorized"): Response {
  return json({ error: message }, 401);
}

export function notFound(message = "not found"): Response {
  return json({ error: message }, 404);
}

export function serverError(message = "internal error", detail?: unknown): Response {
  return json({ error: message, detail }, 500);
}
