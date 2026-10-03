import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/local-db";
import {
  addManualCharge,
  checkout,
  recordCustomerPayment,
  saveCashTransaction,
  stockIn,
  voidSale,
} from "@/lib/repo";
import { addCustomer, addProduct, ctx, line, OTHER, resetDb } from "./helpers";

beforeEach(resetDb);

describe("checkout validation", () => {
  it.each([
    ["negative qty", { quantity: -1 }],
    ["zero qty", { quantity: 0 }],
    ["NaN qty", { quantity: Number.NaN }],
    ["infinite price", { selling_price: Number.POSITIVE_INFINITY }],
    ["negative price", { selling_price: -5 }],
    ["NaN cost", { cost_price: Number.NaN }],
  ])("rejects %s and writes nothing", async (_n, patch) => {
    const p = await addProduct();
    await expect(
      checkout(ctx, { lines: [{ ...line(p), ...patch }], cash_received: 100 }),
    ).rejects.toThrow();
    expect(await db().sales.count()).toBe(0);
    expect((await db().products.get(p.id))!.stock_quantity).toBe(10);
  });

  it("rejects duplicate product lines", async () => {
    const p = await addProduct();
    await expect(checkout(ctx, { lines: [line(p), line(p)], cash_received: 100 })).rejects.toThrow(
      /twice/,
    );
    expect(await db().sales.count()).toBe(0);
  });

  it("rejects nonfinite cash and negative discount", async () => {
    const p = await addProduct();
    await expect(checkout(ctx, { lines: [line(p)], cash_received: Number.NaN })).rejects.toThrow();
    await expect(
      checkout(ctx, { lines: [line(p)], cash_received: 100, discount: -10 }),
    ).rejects.toThrow();
  });

  it("rolls back fully when a product belongs to another store", async () => {
    const mine = await addProduct();
    const theirs = await addProduct({ store_id: OTHER });
    await expect(
      checkout(ctx, { lines: [line(mine), line(theirs)], cash_received: 100 }),
    ).rejects.toThrow(/another store/);
    expect(await db().sales.count()).toBe(0);
    expect(await db().sale_items.count()).toBe(0);
    expect(await db().inventory_movements.count()).toBe(0);
    expect(await db().sync_queue.count()).toBe(0);
    expect((await db().products.get(mine.id))!.stock_quantity).toBe(10);
    expect((await db().products.get(theirs.id))!.stock_quantity).toBe(10);
  });

  it("rejects utang for a wrong-store or missing customer", async () => {
    const p = await addProduct();
    const other = await addCustomer({ store_id: OTHER });
    for (const id of [other.id, "missing-customer"]) {
      await expect(
        checkout(ctx, { lines: [line(p)], cash_received: 0, payment_method: "utang", customer_id: id }),
      ).rejects.toThrow(/Customer/);
    }
    expect(await db().sales.count()).toBe(0);
    expect((await db().customers.get(other.id))!.credit_balance).toBe(0);
  });

  it("valid sale deducts stock, computes money and queues the group", async () => {
    const p = await addProduct();
    const { sale } = await checkout(ctx, { lines: [line(p, 3)], cash_received: 50 });
    expect(sale.total).toBe(45);
    expect(sale.change_amount).toBe(5);
    expect((await db().products.get(p.id))!.stock_quantity).toBe(7);
    const q = await db().sync_queue.toArray();
    expect(q.every((i) => i.group_id === sale.id)).toBe(true);
    expect(q.map((i) => i.entity).sort()).toEqual(
      ["inventory_movements", "products", "sale_items", "sales"].sort(),
    );
  });
});

describe("voidSale", () => {
  async function utangSale() {
    const p = await addProduct();
    const c = await addCustomer();
    const { sale } = await checkout(ctx, {
      lines: [line(p, 4)],
      cash_received: 0,
      payment_method: "utang",
      customer_id: c.id,
    });
    return { p, c, sale };
  }

  it("restores stock and utang exactly once on repeated void", async () => {
    const { p, c, sale } = await utangSale();
    expect((await db().customers.get(c.id))!.credit_balance).toBe(60);
    expect(await voidSale(ctx, sale.id)).toBe(true);
    expect(await voidSale(ctx, sale.id)).toBe(false);
    expect((await db().products.get(p.id))!.stock_quantity).toBe(10);
    expect((await db().customers.get(c.id))!.credit_balance).toBe(0);
    const restores = await db()
      .inventory_movements.filter((m) => m.movement_type === "void_restore")
      .count();
    expect(restores).toBe(1);
  });

  it("restores once under concurrent voids", async () => {
    const { p, c, sale } = await utangSale();
    const results = await Promise.all([voidSale(ctx, sale.id), voidSale(ctx, sale.id), voidSale(ctx, sale.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db().products.get(p.id))!.stock_quantity).toBe(10);
    expect((await db().customers.get(c.id))!.credit_balance).toBe(0);
  });

  it("queues every void change atomically in one group", async () => {
    const { sale } = await utangSale();
    await db().sync_queue.clear();
    await voidSale(ctx, sale.id);
    const q = await db().sync_queue.toArray();
    expect(q.map((i) => i.entity).sort()).toEqual(
      ["customers", "inventory_movements", "products", "sales"].sort(),
    );
    expect(new Set(q.map((i) => i.group_id)).size).toBe(1);
  });

  it("ignores a sale from another store", async () => {
    const { sale, p } = await utangSale();
    expect(await voidSale({ ...ctx, storeId: OTHER }, sale.id)).toBe(false);
    expect((await db().sales.get(sale.id))!.status).toBe("completed");
    expect((await db().products.get(p.id))!.stock_quantity).toBe(6);
  });

  it("does not touch another store's product referenced by an item", async () => {
    const { sale, p } = await utangSale();
    await db().products.update(p.id, { store_id: OTHER });
    await voidSale(ctx, sale.id);
    expect((await db().products.get(p.id))!.stock_quantity).toBe(6);
  });
});

describe("cash ledger", () => {
  const base = { transaction_type: "cash_in" as const, provider: "gcash" as const, amount: 100 };

  it.each([
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -5 }],
    ["NaN amount", { amount: Number.NaN }],
    ["infinite amount", { amount: Number.POSITIVE_INFINITY }],
    ["negative fee", { service_fee: -1 }],
    ["NaN fee", { service_fee: Number.NaN }],
    ["infinite fee", { service_fee: Number.POSITIVE_INFINITY }],
  ])("rejects %s", async (_n, patch) => {
    await expect(saveCashTransaction(ctx, { ...base, ...patch })).rejects.toThrow();
    expect(await db().cash_transactions.count()).toBe(0);
    expect(await db().sync_queue.count()).toBe(0);
  });

  it("commits row, photo, queue and audit together", async () => {
    const row = await saveCashTransaction(ctx, {
      ...base,
      service_fee: 5,
      photo: new Blob(["img"], { type: "image/jpeg" }),
    });
    expect(row.service_fee).toBe(5);
    expect(await db().cash_photos.where("cash_transaction_id").equals(row.id).count()).toBe(1);
    expect(await db().sync_queue.where("entity_id").equals(row.id).count()).toBe(1);
    expect(await db().audit_logs.count()).toBe(1);
  });

  it("rolls back the row when the photo write fails", async () => {
    const bad = { size: 1, type: "image/jpeg" } as unknown as Blob;
    const original = db().cash_photos.put.bind(db().cash_photos);
    db().cash_photos.put = (() => Promise.reject(new Error("disk full"))) as never;
    try {
      await expect(saveCashTransaction(ctx, { ...base, photo: bad })).rejects.toThrow(/disk full/);
    } finally {
      db().cash_photos.put = original;
    }
    expect(await db().cash_transactions.count()).toBe(0);
    expect(await db().sync_queue.count()).toBe(0);
    expect(await db().audit_logs.count()).toBe(0);
  });
});

describe("customer ledger", () => {
  it("rejects missing and wrong-store customers without writing", async () => {
    const other = await addCustomer({ store_id: OTHER, credit_balance: 50 });
    for (const id of [other.id, "missing"]) {
      await expect(recordCustomerPayment(ctx, { customer_id: id, amount: 10 })).rejects.toThrow();
      await expect(addManualCharge(ctx, { customer_id: id, amount: 10 })).rejects.toThrow();
    }
    expect(await db().customer_payments.count()).toBe(0);
    expect(await db().sync_queue.count()).toBe(0);
    expect((await db().customers.get(other.id))!.credit_balance).toBe(50);
  });

  it("payment and charge adjust the balance", async () => {
    const c = await addCustomer({ credit_balance: 100 });
    await recordCustomerPayment(ctx, { customer_id: c.id, amount: 30 });
    await addManualCharge(ctx, { customer_id: c.id, amount: 5 });
    expect((await db().customers.get(c.id))!.credit_balance).toBe(75);
  });
});

describe("inventory", () => {
  it("stockIn rejects invalid qty and wrong store", async () => {
    const theirs = await addProduct({ store_id: OTHER });
    const mine = await addProduct();
    await expect(stockIn(ctx, { product_id: mine.id, quantity: Number.NaN })).rejects.toThrow();
    await expect(stockIn(ctx, { product_id: theirs.id, quantity: 5 })).rejects.toThrow();
    expect((await db().products.get(theirs.id))!.stock_quantity).toBe(10);
  });
});
