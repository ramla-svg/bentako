import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/local-db";
import { enqueue, syncNow } from "@/lib/sync-service";
import { addProduct, resetDb } from "./helpers";

const g = globalThis as any;

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
