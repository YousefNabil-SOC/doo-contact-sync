import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * Parsing is lazy and cached so that importing this module never throws at
 * build time (Next.js may import route modules during `next build`). Secrets
 * are read at request time on the server only; nothing here is exposed to the
 * client (no NEXT_PUBLIC_* values).
 */
const EnvSchema = z.object({
  // HubSpot OAuth app credentials (from Phase 0).
  HUBSPOT_CLIENT_ID: z.string().min(1),
  HUBSPOT_CLIENT_SECRET: z.string().min(1),
  HUBSPOT_REDIRECT_URI: z.string().url(),

  // Space-separated OAuth scopes. "oauth" is required by HubSpot for the flow.
  HUBSPOT_SCOPES: z
    .string()
    .min(1)
    .default(
      "oauth crm.objects.contacts.read crm.objects.contacts.write",
    ),

  // Public base URL of this app. Used to build the canonical webhook URI for
  // v3 signature verification and as the OAuth redirect base in dev.
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Optional 32-byte key (base64) to encrypt tokens at rest with AES-256-GCM.
  // If absent, tokens are stored as-is and a warning is logged.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),

  // Database (Supabase). Pooled URL for runtime, direct URL for migrations.
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the cache (used by tests). */
export function resetEnvCache(): void {
  cached = null;
}
