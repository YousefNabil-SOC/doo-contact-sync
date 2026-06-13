import { describe, it, expect } from "vitest";
import { inboundUpsert, outboundSync } from "@/lib/sync/engine";
import type { SyncPorts } from "@/lib/sync/ports";
import { FakeGateway, FakeLedger, FakeRepo } from "./fakes";

function makePorts(): { ports: SyncPorts; repo: FakeRepo; gateway: FakeGateway; ledger: FakeLedger } {
  const repo = new FakeRepo();
  const gateway = new FakeGateway();
  const ledger = new FakeLedger();
  const ports: SyncPorts = {
    repo,
    gateway,
    ledger,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
  return { ports, repo, gateway, ledger };
}

describe("two-way sync round-trip", () => {
  it("outbound create then inbound echo is skipped (loop prevention)", async () => {
    const { ports, repo, gateway } = makePorts();

    const local = await repo.create({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+100",
    });

    const out = await outboundSync(ports, local.id);
    expect(out.outcome).toBe("CREATE");
    expect(out.hubspotId).toBeTruthy();
    expect(gateway.createCalls).toBe(1);

    // The webhook for our own write echoes back the identical record.
    const inbound = await inboundUpsert(ports, {
      hubspotId: out.hubspotId!,
      type: "propertyChange",
    });
    expect(inbound.outcome).toBe("SKIP");
    expect(inbound.detail).toBe("echo_guard");
    // No duplicate local contact created.
    expect(repo.rows.size).toBe(1);
  });

  it("outbound is idempotent: a second push with no change is skipped", async () => {
    const { ports, repo, gateway } = makePorts();
    const local = await repo.create({ email: "id@example.com" });

    await outboundSync(ports, local.id);
    const second = await outboundSync(ports, local.id);

    expect(second.outcome).toBe("SKIP");
    expect(gateway.createCalls).toBe(1);
    expect(gateway.updateCalls).toBe(0);
  });

  it("inbound creates a HubSpot-origin contact, then echoes are skipped", async () => {
    const { ports, repo, gateway } = makePorts();
    gateway.seed("999", {
      email: "new@example.com",
      firstname: "New",
      lastname: "Person",
      lastmodifieddate: "5000",
    });

    const created = await inboundUpsert(ports, {
      hubspotId: "999",
      type: "creation",
    });
    expect(created.outcome).toBe("CREATE");
    expect(repo.rows.size).toBe(1);

    const again = await inboundUpsert(ports, {
      hubspotId: "999",
      type: "propertyChange",
    });
    expect(again.outcome).toBe("SKIP");
    expect(again.detail).toBe("echo_guard");
  });

  it("conflict: a newer local change is not overwritten by an older remote", async () => {
    const { ports, repo, gateway } = makePorts();
    const local = await repo.create({
      email: "c@example.com",
      firstName: "Original",
    });
    await outboundSync(ports, local.id);
    const hubspotId = (await repo.findById(local.id))!.hubspotObjectId!;

    // Remote edits the record, but its lastmodifieddate is far older than the
    // local row's updatedAt (2026), so local must win.
    await gateway.update(hubspotId, { firstname: "RemoteEdit" });

    const inbound = await inboundUpsert(ports, {
      hubspotId,
      type: "propertyChange",
    });
    expect(inbound.outcome).toBe("SKIP");
    expect(inbound.detail).toBe("local_newer");

    const after = await repo.findById(local.id);
    expect(after?.firstName).toBe("Original");
  });
});
