import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  activePlan,
  ANNUAL_SAVING,
  GRACE_DAYS,
  PLAN_AVAILABILITY,
  PLAN_LIMITS,
  PRO_PRICE_MONTHLY,
  PRO_PRICE_YEARLY,
} from "@/lib/plan";
import { db } from "@/lib/local-db";
import {
  duplicateProduct,
  getCashPhoto,
  putCashPhoto,
  restoreProduct,
  saveCashTransaction,
  saveProduct,
  seedDemoProducts,
} from "@/lib/repo";
import { addProduct, ctx, OTHER, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());

describe("retained plan rules and available screens", () => {
  it("retains 99 monthly and 999 yearly with 189 annual saving", () => {
    expect(PRO_PRICE_MONTHLY).toBe(99);
    expect(PRO_PRICE_YEARLY).toBe(999);
    expect(ANNUAL_SAVING).toBe(189);
  });
  it("retains Free 60 products and 1 device", () => {
    expect(PLAN_LIMITS.free.products).toBe(60);
    expect(PLAN_LIMITS.free.devices).toBe(1);
  });
  it("retains unlimited Pro products, 3 devices and 2 cashier seats", () => {
    expect(PLAN_LIMITS.pro.products).toBe(Infinity);
    expect(PLAN_LIMITS.pro.devices).toBe(3);
    expect(PLAN_LIMITS.pro.cashiers).toBe(2);
    expect(PLAN_AVAILABILITY.cashierManagement).toBe(false);
  });
  it("keeps the 14-day grace inclusive and lapses immediately after it", () => {
    vi.useFakeTimers();
    const end = Date.parse("2026-10-01T00:00:00Z");
    const store = { plan: "pro", plan_expires_at: new Date(end).toISOString() };
    expect(GRACE_DAYS).toBe(14);
    vi.setSystemTime(end + 14 * 86400000);
    expect(activePlan(store)).toBe("pro");
    vi.setSystemTime(end + 14 * 86400000 + 1);
    expect(activePlan(store)).toBe("free");
  });
  it("distinguishes available 7/30-day reports and logs from retained unlimited Pro history", () => {
    expect(PLAN_AVAILABILITY.reportDays).toEqual({ free: 7, pro: 30 });
    expect(PLAN_AVAILABILITY.walletLogDays).toEqual({ free: 7, pro: 30 });
    expect(PLAN_AVAILABILITY.paymentsSummaryDays).toBe(30);
    expect(PLAN_LIMITS.pro.reportDays).toBe(Infinity);
    expect(PLAN_LIMITS.pro.walletHistoryDays).toBe(Infinity);
  });
  it("does not entitle either plan to an unimplemented export", () => {
    expect(PLAN_LIMITS.free.export).toBe(false);
    expect(PLAN_LIMITS.pro.export).toBe(false);
  });
});

describe("active product capacity at every local write entry point", () => {
  async function fill(count: number) {
    for (let i = 0; i < count; i += 1) await addProduct({ id: `capacity-${i}` });
  }
  const input = {
    name: "New",
    cost_price: 1,
    selling_price: 2,
    stock_quantity: 0,
    low_stock_threshold: 5,
    unit_type: "piece" as const,
  };
  it("rejects create, duplicate and restore at 60 without deleting rows", async () => {
    await fill(60);
    const archived = await addProduct({ is_active: false });
    await expect(saveProduct(ctx, input)).rejects.toThrow(/60/);
    await expect(duplicateProduct(ctx, "capacity-0")).rejects.toThrow(/60/);
    await expect(restoreProduct(ctx, archived.id)).rejects.toThrow(/60/);
    expect(await db().products.count()).toBe(61);
    expect((await db().products.get(archived.id))?.is_active).toBe(false);
    expect(await db().sync_queue.count()).toBe(0);
  });
  it("allows edit and idempotent restore at 60, and Pro growth beyond 60", async () => {
    await fill(60);
    await saveProduct(ctx, { ...input, id: "capacity-0" });
    await restoreProduct(ctx, "capacity-0");
    await saveProduct({ ...ctx, plan: { plan: "pro" } }, input);
    expect(await db().products.count()).toBe(61);
  });
  it("serializes concurrent creation so Free cannot exceed 60", async () => {
    await fill(59);
    const result = await Promise.allSettled([saveProduct(ctx, input), saveProduct(ctx, input)]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().products.count()).toBe(60);
  });
  it("stops sample products at capacity", async () => {
    await fill(59);
    expect(await seedDemoProducts(ctx)).toBe(1);
    expect(await db().products.count()).toBe(60);
  });
  it("does not duplicate another store's product", async () => {
    const other = await addProduct({ store_id: OTHER });
    await expect(duplicateProduct(ctx, other.id)).rejects.toThrow(/this store/);
    expect(await db().products.count()).toBe(1);
  });
});

describe("wallet photo entitlement and downgrade preservation", () => {
  const proCtx = { ...ctx, plan: { plan: "pro" } };
  const input = { amount: 100, provider: "gcash" as const, transaction_type: "cash_in" as const };
  const photo = () => new Blob(["photo"], { type: "image/jpeg" });
  it("rejects Free photo creation without partial cash writes", async () => {
    await expect(saveCashTransaction(ctx, { ...input, photo: photo() })).rejects.toThrow(/Pro/);
    expect(await db().cash_transactions.count()).toBe(0);
    expect(await db().cash_photos.count()).toBe(0);
    expect(await db().sync_queue.count()).toBe(0);
  });
  it("blocks Free replacement while preserving readable existing Pro photos", async () => {
    const entry = await saveCashTransaction(proCtx, { ...input, photo: photo() });
    const original = await getCashPhoto(entry.id);
    await expect(putCashPhoto(ctx, entry.id, photo())).rejects.toThrow(/Pro/);
    expect((await getCashPhoto(entry.id))?.id).toBe(original?.id);
    expect(await db().cash_photos.count()).toBe(1);
  });
  it("allows Pro attachment only to its own existing entry", async () => {
    const entry = await saveCashTransaction(ctx, input);
    await putCashPhoto(proCtx, entry.id, photo());
    await expect(putCashPhoto({ ...proCtx, storeId: OTHER }, entry.id, photo())).rejects.toThrow(
      /this store/,
    );
    await expect(putCashPhoto(proCtx, "missing", photo())).rejects.toThrow(/this store/);
    expect(await db().cash_photos.count()).toBe(1);
  });
});
