import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, ok, badRequest, notFound } from "@/lib/http/responses";
import { ContactUpdateSchema } from "@/lib/validation";
import { pushContactOutbound } from "@/lib/sync/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/contacts/:id - fetch one local contact. */
export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return notFound("contact_not_found");
  return ok({ contact });
}

/** PATCH /api/contacts/:id - update a local contact and push to HubSpot. */
export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const { id } = await params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return badRequest("invalid_json");
  }

  const parsed = ContactUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("validation_failed", parsed.error.flatten());
  }

  try {
    const contact = await prisma.contact.update({
      where: { id },
      data: { ...parsed.data, version: { increment: 1 } },
    });
    const sync = await pushContactOutbound(contact.id);
    return ok({ contact, sync });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return notFound("contact_not_found");
    }
    throw err;
  }
}
