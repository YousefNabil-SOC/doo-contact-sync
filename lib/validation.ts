import { z } from "zod";

/** Input validation schemas (zod). All external input is validated here. */

const emailSchema = z.string().trim().email().max(254);
const nameSchema = z.string().trim().min(1).max(255);
const phoneSchema = z.string().trim().min(1).max(64);

export const ContactCreateSchema = z
  .object({
    email: emailSchema.optional(),
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine(
    (v) => v.email || v.firstName || v.lastName || v.phone,
    { message: "at least one of email, firstName, lastName, phone is required" },
  );

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;

export const ContactUpdateSchema = z
  .object({
    email: emailSchema.nullish(),
    firstName: nameSchema.nullish(),
    lastName: nameSchema.nullish(),
    phone: phoneSchema.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "no fields provided",
  });

export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;

export const SyncRequestSchema = z
  .object({
    maxPages: z.number().int().min(1).max(50).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
  })
  .optional();
