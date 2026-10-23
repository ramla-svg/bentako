import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import { clearAllPins, hasPin, lockoutMs, setPin, verifyPin } from "@/lib/offline-pin";
import { enqueue, setCloudBackupEnabled, setSyncContext, syncNow } from "@/lib/sync-service";
import { addProduct, resetDb, STORE } from "./helpers";

const hooks = globalThis as unknown as { __online: boolean; __upsert: unknown };

beforeEach(async () => {
  hooks.__online = false;
  await resetDb();
  setSyncContext("user-test", STORE);
  setCloudBackupEnabled(true);
});

describe("offline PIN", () => {
  it("unlocks with the right PIN and rejects a wrong one offline", async () => {
    await setPin("u1", "s1", "1234");
    expect((await verifyPin("u1", "s1", "0000")).ok).toBe(false);
    expect((await verifyPin("u1", "s1", "1234")).ok).toBe(true);
  });

  it("never stores the PIN digits", async () => {
    await setPin("u1", "s1", "4321");
    const raw = JSON.stringify(await db().settings.toArray());
    expect(raw).not.toContain("4321");
  });

  it("waits after 5 wrong tries", async () => {
    await setPin("u1", "s1", "1234");
    for (let i = 0; i < 4; i++) await verifyPin("u1", "s1", "9999", 1000);
    const fifth = await verifyPin("u1", "s1", "9999", 1000);
    expect(fifth).toEqual({ ok: false, waitMs: 30_000, left: 0 });
    expect((await verifyPin("u1", "s1", "1234", 2000)).ok).toBe(false);
    expect((await verifyPin("u1", "s1", "1234", 40_000)).ok).toBe(true);
    expect(lockoutMs(6)).toBe(60_000);
  });

  it("keeps each account's PIN separate", async () => {
    await setPin("u1", "s1", "1234");
    expect(await hasPin("u2", "s1")).toBe(false);
  });

  it("sign-out removes the PIN", async () => {
    await setPin("u1", "s1", "1234");
    await clearAllPins();
    expect(await hasPin("u1", "s1")).toBe(false);
  });
});

describe("faster sync", () => {
  it("uploads many products in one request", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    hooks.__upsert = upsert;
    for (let i = 0; i < 5; i++) {
      const p = await addProduct({ sync_status: "pending" });
      await enqueue("products", p.id);
    }
    hooks.__online = true;
    await syncNow();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("Free (backup off) uploads nothing", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    hooks.__upsert = upsert;
    setCloudBackupEnabled(false);
    hooks.__online = true;
    const p = await addProduct({ sync_status: "pending" });
    await enqueue("products", p.id);
    await syncNow();
    expect(upsert).not.toHaveBeenCalled();
    expect(await db().sync_queue.count()).toBe(1);
  });
});
