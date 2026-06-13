# BUILD-LOG

AI-assisted build log for DOO Contact Sync. One entry per commit: what changed,
the intent behind it, and key decisions. Tool: Claude Code (Opus 4.8).

---

## 2026-06-13 - Phase 1 connector build

### Commit 1 - chore: scaffold Next.js + TS strict + Prisma + tooling
- Intent: stand up the project skeleton on the decided stack (Next.js App
  Router, TypeScript strict, Prisma, Vitest) at the repo root so Next loads the
  existing `.env.local` directly and Vercel can deploy from root.
- Changed: `package.json`, `tsconfig.json` (strict + `noUncheckedIndexedAccess`),
  `next.config.mjs` (Prisma marked as a server external package),
  `vitest.config.ts`, `.gitignore` (Next/Prisma/test artifacts),
  `.env.local.example`, minimal `app/` shell, and core libs `lib/env.ts`
  (zod-validated, lazy/cached so build never throws), `lib/logger.ts`
  (structured JSON + recursive secret redaction), `lib/prisma.ts` (singleton).
- Decisions: app lives at repo root (single `.env.local`, simplest Vercel
  deploy). Env parsing is lazy and cached to keep `next build` from evaluating
  secrets at build time.

### Commit 2 - feat(db): Prisma schema + initial migration
- Intent: model tokens, the local contact store, the sync ledger, and webhook
  events; apply the schema to Supabase.
- Changed: `prisma/schema.prisma` (Connection, Contact, SyncLedger,
  WebhookEvent), `prisma/migrations/0_init`, `scripts/db-check.mjs`.
- Decisions: HubSpot ids stored as `BigInt`. `Contact.lastSyncedHash` is the
  loop guard. Prisma CLI only reads `.env`, so `prisma:*` scripts are wrapped
  with `dotenv -e .env.local`. Supabase's direct host is IPv6-only and returned
  P1001; the migration was generated offline with `prisma migrate diff` and
  applied with `prisma migrate deploy` over the working pooler connection
  (verified: all four tables queryable).

### Commit 3 - feat(hubspot): OAuth, tokens, client, signature, contacts
- Intent: ground every HubSpot interaction in the real provider spec.
- Changed: `lib/hubspot/oauth.ts` (authorize URL, code exchange, refresh,
  token-info lookup), `lib/hubspot/tokens.ts` (auto-refresh with skew, encrypt
  at rest), `lib/hubspot/client.ts` (429 + 5xx retry with backoff),
  `lib/hubspot/signature.ts` (v3 verify), `lib/hubspot/contacts.ts`,
  `lib/crypto/token-cipher.ts` (AES-256-GCM), `lib/http/responses.ts`
  (BigInt-safe JSON).
- Decisions: token + signature formulas taken from HubSpot's current docs, not
  memory - token endpoint `POST /oauth/v1/token`; v3 signature is
  `base64(HMAC_SHA256(secret, method+uri+body+timestamp))` with a 5-minute
  freshness window and constant-time compare. Backoff jitter is deterministic
  (no `Math.random`) for reproducible tests.

### Commit 4 - feat(sync): two-way sync engine
- Intent: idempotent, loop-safe sync with documented conflict resolution.
- Changed: `lib/sync/ports.ts` (interfaces), `lib/sync/engine.ts`
  (outbound/inbound), `lib/sync/reconcile.ts`, `lib/sync/mapping.ts`,
  `lib/sync/hash.ts`, `lib/sync/adapters.ts` (Prisma wiring),
  `lib/sync/runtime.ts`, `lib/validation.ts` (zod).
- Decisions: the engine depends on ports (repo/ledger/gateway) so it is unit
  testable with fakes. Loop prevention via `lastSyncedHash` echo check applied
  in both directions; conflict resolution is last-write-wins by update
  timestamp.

### Commit 5 - feat(api): route handlers
- Intent: expose OAuth, webhooks, contacts, sync, and health over HTTP.
- Changed: `app/api/oauth/start`, `app/api/oauth/callback`,
  `app/api/webhooks/hubspot`, `app/api/contacts`, `app/api/contacts/[id]`,
  `app/api/sync`, `app/api/health`.
- Decisions: all routes are Node runtime + `force-dynamic`. The webhook handler
  reads the raw body and verifies the signature before any parsing or DB write.
  OAuth `state` is bound to an httpOnly cookie.

### Commit 6 - test: unit + round-trip
- Intent: prove the security- and correctness-critical logic.
- Changed: `test/signature.test.ts`, `test/tokens.test.ts`,
  `test/conflict.test.ts`, `test/roundtrip.test.ts`, `test/fakes.ts`.
- Decisions: 26 tests covering signature verification (valid/tamper/stale/
  missing), token refresh, content-hash idempotency, conflict resolution, the
  AES-GCM cipher, and an outbound->inbound echo round-trip proving loop
  prevention - all without a live portal or database.

### Commit 7 - docs: README, OpenAPI, status
- Intent: make the connector self-explanatory and reviewable.
- Changed: `README.md`, `docs/openapi.yaml`, `BUILD-LOG.md`, `CLAUDE.md`
  (Phase 1 status).
- Decisions: documented the OAuth/webhook/sync design, env vars, the Supabase
  `DIRECT_URL` migration note, and the full route contract.
