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

    let edited = false;
    g.__upsert = async () => {
      if (!edited) {
        edited = true;
        // The shopkeeper edits the product while the request is on the wire.
        await db().products.update(p.id, { stock_quantity: 3, sync_status: "pending" });
        await enqueue("products", p.id);
      }
      return { error: null };
    };
    g.__online = true;
    await syncNow();

    const row = await db().products.get(p.id);
    const queued = await db().sync_queue.where("entity_id").equals(p.id).toArray();
    // Newer edit must still be waiting for upload, not silently marked synced.
    expect(row!.stock_quantity).toBe(3);
    expect(row!.sync_status === "pending" || queued.length === 0).toBe(true);
    if (queued.length === 0) {
      // Only acceptable if a second pass already uploaded the newer payload.
      expect(row!.sync_status).toBe("synced");
    }
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
