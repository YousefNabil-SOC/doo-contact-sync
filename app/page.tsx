export default function HomePage() {
  return (
    <main style={{ maxWidth: 720 }}>
      <h1 style={{ color: "#0d1b3e" }}>DOO Contact Sync</h1>
      <p>
        Production-grade HubSpot two-way contact sync connector. OAuth 2.0 with
        automatic token refresh, signature-verified webhooks, and a
        Postgres-backed sync ledger with idempotency and loop prevention.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/health</code> - service, database, token, and config
          status
        </li>
        <li>
          <code>GET /api/oauth/start</code> - begin HubSpot OAuth (redirects)
        </li>
        <li>
          <code>GET /api/oauth/callback</code> - OAuth redirect target
        </li>
        <li>
          <code>POST /api/webhooks/hubspot</code> - inbound, signature-verified
        </li>
        <li>
          <code>GET/POST /api/contacts</code>, <code>PATCH /api/contacts/:id</code>
        </li>
        <li>
          <code>POST /api/sync</code> - reconcile both sides on demand
        </li>
      </ul>
      <p style={{ color: "#666" }}>
        See README.md and docs/openapi.yaml for full documentation.
      </p>
    </main>
  );
}
