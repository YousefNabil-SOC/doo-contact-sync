import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  handleCreateContact,
  handleFindContact,
  handleGetSyncStatus,
  handleSyncNow,
} from "@/mcp/tools";
import type { LocalAndSyncDeps, StatusReaders } from "@/lib/services/connector-service";
import type { SyncPorts } from "@/lib/sync/ports";
import { FakeGateway, FakeLedger, FakeRepo } from "./fakes";

function parse(res: CallToolResult): any {
  const item = res.content?.[0];
  if (!item || item.type !== "text") throw new Error("expected text content");
  return JSON.parse(item.text);
}

function makeDeps(): { deps: LocalAndSyncDeps; repo: FakeRepo; gateway: FakeGateway } {
  const repo = new FakeRepo();
  const gateway = new FakeGateway();
  const ledger = new FakeLedger();
  const ports: SyncPorts = {
    repo,
    gateway,
    ledger,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
  return { deps: { repo, ports }, repo, gateway };
}

describe("MCP tool input validation (always returns, never throws)", () => {
  it("create_contact rejects empty input", async () => {
    const { deps } = makeDeps();
    const res = await handleCreateContact(deps, {});
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("validation_failed");
  });

  it("create_contact rejects a malformed email", async () => {
    const { deps } = makeDeps();
    const res = await handleCreateContact(deps, { email: "not-an-email" });
    expect(res.isError).toBe(true);
  });

  it("find_contact requires a valid email", async () => {
    const { deps } = makeDeps();
    expect((await handleFindContact(deps, {})).isError).toBe(true);
    expect((await handleFindContact(deps, { email: "x" })).isError).toBe(true);
  });

  it("sync_now rejects out-of-range pageSize", async () => {
    const res = await handleSyncNow(null, { pageSize: 9999 });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("validation_failed");
  });

  it("get_sync_status rejects out-of-range limit", async () => {
    const readers = stubReaders();
    const res = await handleGetSyncStatus(readers, { limit: 0 });
    expect(res.isError).toBe(true);
  });
});

describe("MCP tool happy paths (mocked HubSpot via fakes)", () => {
  it("create_contact creates locally and syncs to HubSpot", async () => {
    const { deps, gateway } = makeDeps();
    const res = await handleCreateContact(deps, {
      email: "ada@example.com",
      firstName: "Ada",
    });
    expect(res.isError).toBeFalsy();
    const data = parse(res);
    expect(data.contact.email).toBe("ada@example.com");
    expect(data.sync.status).toBe("synced");
    expect(data.sync.outcome).toBe("CREATE");
    expect(gateway.createCalls).toBe(1);
  });

  it("find_contact returns a local match", async () => {
    const { deps, repo } = makeDeps();
    await repo.create({ email: "find@example.com", firstName: "Find" });
    const data = parse(await handleFindContact(deps, { email: "find@example.com" }));
    expect(data.source).toBe("local");
    expect(data.contact.email).toBe("find@example.com");
  });

  it("find_contact falls back to HubSpot when not local", async () => {
    const { deps, gateway } = makeDeps();
    gateway.seed("777", { email: "remote@example.com", firstname: "Remote" });
    const data = parse(await handleFindContact(deps, { email: "remote@example.com" }));
    expect(data.source).toBe("hubspot");
    expect(data.contact.hubspotObjectId).toBe("777");
  });

  it("sync_now returns no_connection when no portal is connected", async () => {
    const res = await handleSyncNow(null, {});
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("no_connection");
  });

  it("sync_now reconciles when connected", async () => {
    const { deps } = makeDeps();
    const data = parse(await handleSyncNow(deps.ports, {}));
    expect(data.connected).toBe(true);
    expect(data.summary).toBeDefined();
  });

  it("get_sync_status returns counts and recent ledger", async () => {
    const readers = stubReaders();
    const data = parse(await handleGetSyncStatus(readers, { limit: 5 }));
    expect(data.counts.contacts).toBe(3);
    expect(data.connection.connected).toBe(false);
    expect(Array.isArray(data.recent)).toBe(true);
  });
});

function stubReaders(): StatusReaders {
  return {
    connectionStatus: async () => ({
      connected: false,
      portalId: null,
      expiresAt: null,
      expired: true,
    }),
    counts: async () => ({ contacts: 3, ledgerEntries: 7 }),
    recentLedger: async () => [],
  };
}
