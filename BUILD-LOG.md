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

### Follow-ups
- `chore: ignore .omc tooling artifacts` - keep the tree clean.
- `docs: add Mermaid architecture diagram` - GitHub-rendered diagram of the
  outbound/inbound flow through the engine, client, token manager, and DB.
- `docs: log follow-up commits` - this entry (keeps one log entry per commit).

---

## 2026-06-13 - Phase 2: MCP server wrapping the connector

### Commit 8 - docs: persist DOO + Builders League knowledge base
- Intent: never lose the company/league context across sessions.
- Changed: `DOO-KNOWLEDGE-BASE.md` (DOO product, league tracks, Phase 1/2,
  hiring funnel, build-log rule, Yousef's 98/100 screening), `CLAUDE.md`
  (pointer to it), `.gitignore` (.vscode, mcp/dist).
- Decision: captured from build.doo.ooo + www.doo.ooo and the application
  screenshots so a fresh session is fully grounded.

### Commit 9 - refactor: shared service layer + gateway search (reuse, no dup)
- Intent: expose the connector's logic through one shared layer that both the
  HTTP routes and the MCP server call - no duplicated business logic.
- Changed: `lib/services/connector-service.ts` (createContact, findContact,
  syncNow, getSyncStatus - dependency-injected), extended `ContactGateway`
  with `searchByEmail` (`lib/sync/ports.ts`, `lib/hubspot/contacts.ts`,
  `lib/sync/adapters.ts`, `test/fakes.ts`), refactored
  `app/api/contacts/route.ts` to call the service, and taught `lib/logger.ts`
  to route all output to stderr when `LOG_TO_STDERR=1`.
- Decision: DI (repo + optional SyncPorts) keeps the service testable with
  in-memory fakes and identical in production.

### Commit 10 - feat(mcp): stdio MCP server with four tools
- Intent: expose create_contact, find_contact, sync_now, get_sync_status as MCP
  tools (Claude Code / Cursor / Codex).
- Changed: `mcp/server.ts`, `mcp/tools.ts`, `mcp/bootstrap-env.ts`,
  `tsup.config.ts`, `package.json` (sdk, dotenv, tsup, tsx + mcp scripts).
- Decisions: `@modelcontextprotocol/sdk` v1 with zod-v3 raw-shape input
  schemas (confirmed against the installed .d.ts, not guessed). Every handler
  validates input and ALWAYS returns a structured CallToolResult (never throws)
  so an agent never hangs. stdout is the protocol channel, so logs are forced
  to stderr and dotenv's banner is silenced (quiet:true) - verified 0 stdout
  pollution and all 4 tools enumerate over a real initialize/tools-list
  handshake.

### Commit 11 - test(mcp): validation + happy-path tool tests
- Intent: prove each tool validates input and works end to end without a live
  portal.
- Changed: `test/mcp-tools.test.ts` (11 tests; total suite now 37).
- Decision: call the DI handlers directly with the Phase 1 fakes; assert
  structured errors on bad input and correct results on happy paths.

### Commit 12 - docs: MCP README + status
- Intent: make the MCP server runnable and reviewable.
- Changed: `mcp/README.md` (tools, run, client registration), `BUILD-LOG.md`,
  `CLAUDE.md` (Phase 2 status + files).

---

## 2026-06-13 - Phase 3: go live (public repo + Vercel)

### Commit 13 - chore(deploy): prep deploy artifacts for production
- Intent: make the connector and MCP server publicly reviewable and ready to
  deploy to Vercel without changing any business logic.
- Changed: `README.md` (extended the architecture diagram to include the MCP
  tools and the calling AI agent; added an honest "real vs. local stand-in"
  scope note; added MCP-server and Vercel-deploy sections), `vercel.json`
  (framework + build command), `package.json` (pinned Node 22.x via `engines`),
  `.gitignore` (ignore `.vercel` and a local reference PDF that may hold setup
  secrets), `DEPLOY-ENV-VARS.txt` (names-only production env checklist),
  `BUILD-LOG.md`.
- Decisions: deploy via the Vercel CLI building remotely on Linux, so
  `prisma generate` produces the correct query engine - no `binaryTargets`
  needed. Secrets are entered by hand in the Vercel dashboard, never committed.
  The first deploy is expected to build green with the HubSpot and database
  features inert until the environment variables are set. Verified the build is
  green and that only `/` and `/_not-found` prerender statically while all seven
  API routes are dynamic (so `next build` runs no DB query and needs no secret).

### Commit 14 - feat(hubspot): production redirect URL + webhook subscriptions
- Intent: wire the live HubSpot app to the deployed connector so both OAuth and
  inbound webhooks work in production - kept as config-as-code, not dashboard
  clicks.
- Changed: `doo-contact-sync/src/app/app-hsmeta.json` (added the production
  redirect URL alongside localhost); new
  `doo-contact-sync/src/app/webhooks/webhook-hsmeta.json` (targetUrl = the live
  `/api/webhooks/hubspot`; subscriptions: contact `object.creation` +
  `contact.propertyChange` on email/firstname/lastname/phone). Live URL added to
  `README.md` and `docs/openapi.yaml`.
- Decisions: deployed with `hs project upload` (build #2, auto-deployed to portal
  148692684). The webhook target is the stable Vercel alias so the v3 signature's
  canonical URI matches `APP_BASE_URL`. Subscriptions cover the exact fields the
  sync engine maps, so inbound creations and edits both fire.
- Verified: live `GET /api/health` returns 200 with `config:true, database:true`;
  the deployment is publicly reachable (no Vercel deployment protection).
