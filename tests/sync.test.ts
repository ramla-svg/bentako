import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/local-db";
import { claimAttempt, enqueue, failUpload, finishUpload, syncNow } from "@/lib/sync-service";
import { addProduct, resetDb } from "./helpers";

const g = globalThis as unknown as { __online?: boolean; __upsert?: unknown };

beforeEach(async () => {
  await resetDb();
  g.__online = false;
});

describe("sync race", () => {
  it("keeps a change queued while its earlier upload was in flight", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);

    const uploaded: number[] = [];
    g.__upsert = async (row: { stock_quantity: number }) => {
      uploaded.push(row.stock_quantity);
      if (uploaded.length === 1) {
        // The shopkeeper edits the product while the request is on the wire.
        await db().products.update(p.id, { stock_quantity: 3, sync_status: "pending" });
        await enqueue("products", p.id);
      }
      return { error: null };
    };
    g.__online = true;
    await syncNow();

    // The newer edit must still be queued and pending, not marked synced.
    expect((await db().products.get(p.id))!.sync_status).toBe("pending");
    expect(await db().sync_queue.where("entity_id").equals(p.id).count()).toBe(1);

    await syncNow();
    expect(uploaded).toEqual([10, 3]);
    expect((await db().products.get(p.id))!.sync_status).toBe("synced");
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("deletes queue item and marks synced when nothing changed", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    g.__upsert = async () => ({ error: null });
    g.__online = true;
    await syncNow();
    expect(await db().sync_queue.count()).toBe(0);
    expect((await db().products.get(p.id))!.sync_status).toBe("synced");
  });
});

describe("sync race: pre-request read/stamp and failure path", () => {
  it("claims the current queue item and payload, not a stale snapshot", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const stale = (await db().sync_queue.toArray())[0];
    // Edit lands after the queue was enumerated but before the claim.
    await db().products.update(p.id, { stock_quantity: 4, sync_status: "pending" });
    await enqueue("products", p.id);
    const claim = await claimAttempt(stale, "tok-1");
    expect(claim!.row.stock_quantity).toBe(4);
    const q = await db().sync_queue.get(stale.id);
    expect(q!.attempt_token).toBe("tok-1");
    expect(q!.status).toBe("syncing");
    // updated_at stays a valid ISO timestamp.
    expect(Number.isNaN(Date.parse(q!.updated_at))).toBe(false);
  });

  it("an enqueue after the claim invalidates the attempt on success", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const snap = (await db().sync_queue.toArray())[0];
    const claim = await claimAttempt(snap, "tok-2");
    await db().products.update(p.id, { stock_quantity: 2, sync_status: "pending" });
    await enqueue("products", p.id);
    await finishUpload(claim!.item, "tok-2");
    expect(await db().sync_queue.count()).toBe(1);
    expect((await db().products.get(p.id))!.sync_status).toBe("pending");
  });

  it("edits racing syncNow at any point are never lost (interleaving sweep)", async () => {
    for (let delay = 0; delay < 12; delay++) {
      await resetDb();
      const p = await addProduct({ sync_status: "pending" });
      await enqueue("products", p.id);
      const uploaded: number[] = [];
      g.__upsert = async (row: { stock_quantity: number }) => {
        uploaded.push(row.stock_quantity);
        return { error: null };
      };
      g.__online = true;
      const run = syncNow();
      for (let i = 0; i < delay; i++) await new Promise((r) => setTimeout(r, 0));
      await db().products.update(p.id, { stock_quantity: 3, sync_status: "pending" });
      await enqueue("products", p.id);
      await run;
      // enqueue() also kicks a background sync; drain until idle.
      for (let i = 0; i < 50 && (await db().sync_queue.count()) > 0; i++) {
        await new Promise((r) => setTimeout(r, 5));
        await syncNow();
      }
      expect(uploaded[uploaded.length - 1]).toBe(3);
      expect(await db().sync_queue.count()).toBe(0);
      expect((await db().products.get(p.id))!.sync_status).toBe("synced");
    }
  });

  it.each([
    ["rejected", "violates row-level security"],
    ["network", "Failed to fetch"],
  ])("failure path (%s) keeps newer intent pending", async (_k, message) => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    let calls = 0;
    g.__upsert = async () => {
      calls++;
      if (calls === 1) {
        await db().products.update(p.id, { stock_quantity: 5, sync_status: "pending" });
        await enqueue("products", p.id);
        return { error: { message } };
      }
      return { error: null };
    };
    g.__online = true;
    await syncNow();
    const q = (await db().sync_queue.toArray())[0];
    expect(q.status).toBe("pending");
    expect(q.retry_count).toBe(0);
    expect((await db().products.get(p.id))!.sync_status).toBe("pending");
  });

  it("failUpload marks failed atomically when nothing newer was queued", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const claim = await claimAttempt((await db().sync_queue.toArray())[0], "tok-3");
    expect(await failUpload(claim!.item, "tok-3", "bad row", false)).toBe("failed");
    const q = (await db().sync_queue.toArray())[0];
    expect(q.status).toBe("failed");
    expect(q.retry_count).toBe(1);
    expect((await db().products.get(p.id))!.sync_status).toBe("failed");
  });
});
