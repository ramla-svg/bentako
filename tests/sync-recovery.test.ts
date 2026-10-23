import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import {
  enqueue,
  getSyncState,
  setCloudBackupEnabled,
  setSyncContext,
  syncNow,
  pullAll,
} from "@/lib/sync-service";
import { addProduct, resetDb, STORE, OTHER } from "./helpers";

const hooks = globalThis as unknown as {
  __online: boolean;
  __upsert: unknown;
  __getSession?: unknown;
  __refreshSession?: unknown;
  __select?: unknown;
};
const session = (expires = 3600) => ({
  access_token: "isolated-test",
  user: { id: "user-test" },
  expires_at: Math.floor(Date.now() / 1000) + expires,
});

beforeEach(async () => {
  hooks.__online = false;
  await resetDb();
  hooks.__getSession = async () => ({ data: { session: session() }, error: null });
  hooks.__refreshSession = async () => ({ data: { session: session() }, error: null });
  hooks.__select = undefined;
  setSyncContext("user-test", STORE);
  setCloudBackupEnabled(true);
});

describe("sync recovery", () => {
  it("refreshes an expired cloud session before uploading saved records", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const refresh = vi.fn(async () => ({ data: { session: session() }, error: null }));
    hooks.__getSession = async () => ({ data: { session: session(-1) }, error: null });
    hooks.__refreshSession = refresh;
    hooks.__upsert = async () => ({ error: null });
    hooks.__online = true;
    await syncNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("keeps auth-rejected uploads pending without increasing record failures", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    hooks.__upsert = async () => ({ error: { message: "JWT expired", code: "PGRST303" } });
    hooks.__refreshSession = async () => ({
      data: { session: null },
      error: { message: "Refresh token expired" },
    });
    hooks.__online = true;
    await syncNow();
    const q = await db().sync_queue.toArray();
    expect(q[0]?.status).toBe("pending");
    expect(q[0]?.retry_count).toBe(0);
    expect((await db().products.get(p.id))?.sync_status).toBe("pending");
  });

  it("does not publish a successful-sync timestamp after a rejected upload", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const previous = getSyncState().lastSync;
    hooks.__upsert = async () => ({ error: { message: "constraint violation" } });
    hooks.__online = true;
    await syncNow();
    expect(getSyncState().lastSync).toBe(previous);
    expect(await db().settings.get("last_sync_at")).toBeUndefined();
    expect(await db().sync_queue.count()).toBe(1);
  });

  it("manual retry bypasses backoff without deleting a saved record", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const upload = vi.fn(async () => ({
      error: { message: "constraint violation" } as { message: string } | null,
    }));
    hooks.__upsert = upload;
    hooks.__online = true;
    await syncNow();
    upload.mockImplementation(async () => ({ error: null }));
    await syncNow();
    expect(upload).toHaveBeenCalledTimes(1);
    await syncNow({ retryFailed: true });
    expect(upload).toHaveBeenCalledTimes(2);
    expect((await db().products.get(p.id))?.sync_status).toBe("synced");
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("an auth rejection refreshes once and retries the same UUID", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const refresh = vi.fn(async () => ({ data: { session: session() }, error: null }));
    hooks.__refreshSession = refresh;
    const uploaded: string[] = [];
    hooks.__upsert = async (row: { id: string }) => {
      uploaded.push(row.id);
      return { error: uploaded.length === 1 ? { message: "JWT expired", code: "PGRST303" } : null };
    };
    hooks.__online = true;
    await syncNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(uploaded).toEqual([p.id, p.id]);
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("a permission rejection remains a record failure, not a sign-in failure", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const refresh = vi.fn();
    hooks.__refreshSession = refresh;
    hooks.__upsert = async () => ({
      error: { message: "new row violates row-level security policy", code: "42501", status: 403 },
    });
    hooks.__online = true;
    await syncNow();
    expect(getSyncState().authRequired).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect((await db().sync_queue.toArray())[0]?.status).toBe("failed");
  });

  it("Free keeps queued records and hides old failure badges without uploading", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const q = (await db().sync_queue.toArray())[0];
    await db().sync_queue.update(q.id, {
      status: "failed",
      retry_count: 1,
      last_error: "old error",
    });
    const upload = vi.fn();
    hooks.__upsert = upload;
    setCloudBackupEnabled(false);
    hooks.__online = true;
    await syncNow();
    expect(upload).not.toHaveBeenCalled();
    expect(getSyncState().failed).toBe(0);
    expect(getSyncState().backupEnabled).toBe(false);
    expect(await db().sync_queue.count()).toBe(1);
    expect(await db().products.get(p.id)).toBeDefined();
  });

  it("uploads only the active store and preserves the other store's backlog", async () => {
    const p = await addProduct({ sync_status: "pending" });
    const other = await addProduct({ store_id: OTHER, sync_status: "pending" });
    await enqueue("products", p.id);
    await enqueue("products", other.id);
    const uploaded: string[] = [];
    hooks.__upsert = async (row: { id: string }) => {
      uploaded.push(row.id);
      return { error: null };
    };
    hooks.__online = true;
    await syncNow();
    expect(uploaded).toEqual([p.id]);
    expect((await db().sync_queue.toArray())[0]?.entity_id).toBe(other.id);
    expect(getSyncState().pending).toBe(0);
  });

  it("missing cloud sign-in keeps records pending and offers reconnection", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    hooks.__getSession = async () => ({ data: { session: null }, error: null });
    const upload = vi.fn();
    hooks.__upsert = upload;
    hooks.__online = true;
    await syncNow();
    expect(getSyncState().authRequired).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect((await db().sync_queue.toArray())[0]?.status).toBe("pending");
  });

  it("recovers an interrupted syncing queue item by replaying its UUID", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const q = (await db().sync_queue.toArray())[0];
    await db().sync_queue.update(q.id, { status: "syncing", attempt_token: "interrupted" });
    hooks.__upsert = async () => ({ error: null });
    hooks.__online = true;
    await syncNow();
    expect(await db().sync_queue.count()).toBe(0);
    expect((await db().products.get(p.id))?.sync_status).toBe("synced");
  });

  it("concurrent retry clicks share one upload", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    const upload = vi.fn(async () => ({ error: null }));
    hooks.__upsert = upload;
    hooks.__online = true;
    await Promise.all([syncNow(), syncNow(), syncNow({ retryFailed: true })]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("automatically retries old auth failures without waiting for data backoff", async () => {
    const p = await addProduct({ sync_status: "failed" });
    await enqueue("products", p.id);
    const q = (await db().sync_queue.toArray())[0];
    await db().sync_queue.update(q.id, {
      status: "failed",
      retry_count: 4,
      last_error: "JWT expired",
      last_attempt_at: new Date().toISOString(),
    });
    hooks.__upsert = async () => ({ error: null });
    hooks.__online = true;
    await syncNow();
    expect(await db().sync_queue.count()).toBe(0);
    expect((await db().products.get(p.id))?.sync_status).toBe("synced");
  });

  it("a hung upload times out, preserves intent, and permits the next retry", async () => {
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    hooks.__upsert = () => new Promise(() => {});
    hooks.__online = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const run = syncNow();
      await vi.waitFor(async () =>
        expect((await db().sync_queue.toArray())[0]?.status).toBe("syncing"),
      );
      await vi.advanceTimersByTimeAsync(12000);
      await run;
      expect((await db().sync_queue.toArray())[0]?.status).toBe("pending");
      expect(getSyncState().connection).toBe("online");
    } finally {
      vi.useRealTimers();
    }
    hooks.__upsert = async () => ({ error: null });
    await syncNow();
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("switching stores interrupts a pass without uploading its next record", async () => {
    const p = await addProduct({ sync_status: "pending" });
    const p2 = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    await enqueue("products", p2.id);
    const upload = vi.fn(async () => {
      setSyncContext("user-test", OTHER);
      return { error: null };
    });
    hooks.__upsert = upload;
    hooks.__online = true;
    await syncNow();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await db().sync_queue.count()).toBe(2);
    expect(getSyncState().pending).toBe(0);
    expect(getSyncState().lastSync).toBe(null);
  });

  it("a cloud read failure cannot record a successful pull", async () => {
    const previous = getSyncState().lastSync;
    hooks.__select = async () => ({ data: null, error: { message: "Failed to fetch" } });
    hooks.__online = true;
    await pullAll(STORE);
    expect(getSyncState().lastSync).toBe(previous);
    expect(await db().settings.get("last_sync_at")).toBeUndefined();
    expect(getSyncState().lastIssue).toBeTruthy();
    expect(getSyncState().connection).toBe("online");
  });

  it("a pull preserves a local edit queued while cloud data was being read", async () => {
    const p = await addProduct();
    hooks.__select = async (entity: string) => {
      if (entity !== "products") return { data: [], error: null };
      hooks.__online = false;
      await db().products.update(p.id, { stock_quantity: 3, sync_status: "pending" });
      await enqueue("products", p.id);
      return {
        data: [{ ...p, stock_quantity: 100, updated_at: new Date().toISOString() }],
        error: null,
      };
    };
    hooks.__online = true;
    await pullAll(STORE);
    expect((await db().products.get(p.id))?.stock_quantity).toBe(3);
    expect(await db().sync_queue.count()).toBe(1);
  });

  it("a rejected grouped header blocks its items until manual retry", async () => {
    const now = new Date().toISOString();
    const saleId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    await db()
      .table("sales")
      .put({ id: saleId, store_id: STORE, created_at: now, sync_status: "pending" });
    await db().table("sale_items").put({
      id: itemId,
      sale_id: saleId,
      store_id: STORE,
      created_at: now,
      sync_status: "pending",
    });
    await enqueue("sales", saleId, { groupId: saleId });
    await enqueue("sale_items", itemId, { groupId: saleId });
    const uploaded: string[] = [];
    hooks.__upsert = async (row: { id: string }) => {
      uploaded.push(row.id);
      return { error: { message: "constraint violation" } };
    };
    hooks.__online = true;
    await syncNow();
    await syncNow();
    expect(uploaded).toEqual([saleId]);
    expect(await db().sync_queue.count()).toBe(2);
    hooks.__upsert = async (row: { id: string }) => {
      uploaded.push(row.id);
      return { error: null };
    };
    await syncNow({ retryFailed: true });
    expect(uploaded).toEqual([saleId, saleId, itemId]);
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("foreign-key prerequisites upload before dependent rows across groups", async () => {
    const p = await addProduct({ sync_status: "pending" });
    const categoryId = crypto.randomUUID();
    await db().products.update(p.id, { category_id: categoryId });
    await db().table("categories").put({
      id: categoryId,
      store_id: STORE,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    });
    await enqueue("products", p.id, { groupId: "a" });
    await enqueue("categories", categoryId, { groupId: "z" });
    const uploaded: string[] = [];
    hooks.__upsert = async (row: { id: string }) => {
      uploaded.push(row.id);
      return { error: null };
    };
    hooks.__online = true;
    await syncNow();
    expect(uploaded).toEqual([categoryId, p.id]);
    expect(await db().sync_queue.count()).toBe(0);
  });
});
