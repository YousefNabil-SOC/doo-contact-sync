import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, ok, badRequest } from "@/lib/http/responses";
import { ContactCreateSchema } from "@/lib/validation";
import { pushContactOutbound } from "@/lib/sync/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/contacts - list local contacts. */
export async function GET(): Promise<Response> {
  const contacts = await prisma.contact.findMany({
    where: { deleted: false },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return ok({ count: contacts.length, contacts });
}

/** POST /api/contacts - create a local contact and push it to HubSpot. */
export async function POST(req: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return badRequest("invalid_json");
  }

  const parsed = ContactCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("validation_failed", parsed.error.flatten());
  }

  const contact = await prisma.contact.create({
    data: {
      email: parsed.data.email ?? null,
      firstName: parsed.data.firstName ?? null,
      lastName: parsed.data.lastName ?? null,
      phone: parsed.data.phone ?? null,
    },
  });

  const sync = await pushContactOutbound(contact.id);
  return json({ contact, sync }, 201);
}
