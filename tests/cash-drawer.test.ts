import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/local-db";
import { computeDrawer, toCents } from "@/lib/cash-drawer";
import {
  archiveExpense,
  checkout,
  loadDrawer,
  recordCashCount,
  recordCustomerPayment,
  recordDrawerMovement,
  saveCashTransaction,
  saveExpense,
} from "@/lib/repo";
import { addCustomer, addProduct, ctx, line, OTHER, resetDb, STORE } from "./helpers";

beforeEach(resetDb);
const tick = () => new Promise((r) => setTimeout(r, 3));
const expense = (patch = {}) => ({
  title: "Delivery",
  category: "Other",
  amount: 50,
  expense_date: "2026-10-20",
  paid_from: "cash" as const,
  ...patch,
});

describe("baseline", () => {
  it("has no balance until cash is counted (no arbitrary zero)", async () => {
    const d = await loadDrawer(STORE);
    expect(d.hasBaseline).toBe(false);
  });

  it("ignores sales before the count and adds only later net cash", async () => {
    const p = await addProduct({ selling_price: 15 });
    await checkout(ctx, { lines: [line(p, 2)], cash_received: 100 }); // before count
    await tick();
    await recordCashCount(ctx, { counted: 500 });
    await tick();
    await checkout(ctx, { lines: [line(p, 3)], cash_received: 100 }); // 45 net, 55 change
    const d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(toCents(545));
    const sale = d.events.find((e) => e.source === "cash_sale")!;
    expect([sale.beforeCents, sale.afterCents]).toEqual([50000, 54500]);
  });

  it("excludes utang and non-cash sales", async () => {
    const p = await addProduct();
    const c = await addCustomer();
    await recordCashCount(ctx, { counted: 100 });
    await tick();
    await checkout(ctx, { lines: [line(p, 1)], cash_received: 0, payment_method: "gcash" });
    await checkout(ctx, {
      lines: [line(p, 1)],
      cash_received: 0,
      payment_method: "utang",
      customer_id: c.id,
    });
    expect((await loadDrawer(STORE)).expectedCents).toBe(10000);
  });

  it("a recount resets the balance and shows the difference", async () => {
    await recordCashCount(ctx, { counted: 100 });
    await tick();
    await recordDrawerMovement(ctx, { direction: "add", amount: 50 });
    await tick();
    await recordCashCount(ctx, { counted: 140 });
    const d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(14000);
    expect(d.events.at(-1)!.differenceCents).toBe(-1000);
  });

  it("rejects negative/NaN counts", async () => {
    expect(() => recordCashCount(ctx, { counted: -1 })).toThrow();
    expect(() => recordCashCount(ctx, { counted: Number.NaN })).toThrow();
  });
});

describe("manual movements", () => {
  it("adds and withdraws, idempotent on repeated id", async () => {
    await recordCashCount(ctx, { counted: 0 });
    await tick();
    const id = crypto.randomUUID();
    await Promise.all([
      recordDrawerMovement(ctx, { id, direction: "add", amount: 200 }),
      recordDrawerMovement(ctx, { id, direction: "add", amount: 200 }),
    ]);
    await tick();
    await recordDrawerMovement(ctx, { direction: "withdraw", amount: 0.3 });
    const d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(19970);
    expect(await db().cash_drawer_movements.count()).toBe(3);
  });

  it("rejects zero, negative and infinite amounts", async () => {
    for (const amount of [0, -5, Number.POSITIVE_INFINITY])
      expect(() => recordDrawerMovement(ctx, { direction: "add", amount })).toThrow();
  });
});

describe("repayments", () => {
  it("counts only cash repayments; unknown method is excluded and reported", async () => {
    const c = await addCustomer({ credit_balance: 300 });
    await recordCashCount(ctx, { counted: 0 });
    await tick();
    await recordCustomerPayment(ctx, { customer_id: c.id, amount: 40, payment_method: "cash" });
    await recordCustomerPayment(ctx, { customer_id: c.id, amount: 60, payment_method: "gcash" });
    await db().customer_payments.put({
      id: "legacy",
      store_id: STORE,
      customer_id: c.id,
      sale_id: null,
      amount: 25,
      notes: null,
      created_by: null,
      created_at: new Date(Date.now() + 5).toISOString(),
      sync_status: "synced",
    });
    const d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(4000);
    expect(d.excluded.unknownRepayments).toBe(1);
  });
});

describe("expenses", () => {
  it("only drawer-paid expenses deduct cash", async () => {
    await recordCashCount(ctx, { counted: 500 });
    await tick();
    await saveExpense(ctx, expense());
    await saveExpense(ctx, expense({ paid_from: "gcash", amount: 70 }));
    expect((await loadDrawer(STORE)).expectedCents).toBe(45000);
  });

  it("new expense requires a funding source", async () => {
    await expect(saveExpense(ctx, expense({ paid_from: null }))).rejects.toThrow(/came from/);
    expect(await db().expenses.count()).toBe(0);
  });

  it("edit writes a correction, archive reverses, never double-deducts", async () => {
    await recordCashCount(ctx, { counted: 500 });
    await tick();
    const e = await saveExpense(ctx, expense());
    await saveExpense(ctx, { ...expense({ amount: 80 }), id: e.id });
    await saveExpense(ctx, { ...expense({ amount: 80 }), id: e.id }); // no-op resave
    let d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(42000);
    expect(d.events.filter((x) => x.referenceId === e.id).map((x) => x.cents)).toEqual([
      -5000, -3000,
    ]);
    await saveExpense(ctx, { ...expense({ amount: 80, paid_from: "bank" }), id: e.id });
    expect((await loadDrawer(STORE)).expectedCents).toBe(50000);
    await saveExpense(ctx, { ...expense({ amount: 80 }), id: e.id });
    await archiveExpense(ctx, e.id);
    await archiveExpense(ctx, e.id);
    d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(50000);
  });

  it("legacy unclassified expenses are not deducted and are flagged", async () => {
    await db().expenses.put({
      id: "old",
      store_id: STORE,
      title: "Old",
      category: "Other",
      amount: 99,
      notes: null,
      expense_date: "2026-01-01",
      is_active: true,
      created_by: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      sync_status: "synced",
    });
    await recordCashCount(ctx, { counted: 100 });
    const d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(10000);
    expect(d.unclassifiedExpenseIds).toEqual(["old"]);
    // Classifying an expense from before the count does not touch counted cash.
    await tick();
    await saveExpense(ctx, { ...expense({ amount: 99 }), id: "old" });
    expect((await loadDrawer(STORE)).expectedCents).toBe(10000);
  });

  it("refuses to edit another store's expense", async () => {
    const e = await saveExpense(ctx, expense());
    await expect(
      saveExpense({ ...ctx, storeId: OTHER }, { ...expense(), id: e.id }),
    ).rejects.toThrow();
    await expect(archiveExpense({ ...ctx, storeId: OTHER }, e.id)).rejects.toThrow();
  });
});

describe("e-wallet service entries", () => {
  it("uses only the explicit drawer effect, legacy rows excluded", async () => {
    await recordCashCount(ctx, { counted: 1000 });
    await tick();
    // Customer cash-in: hands over 500 cash + 10 fee in cash.
    await saveCashTransaction(ctx, {
      transaction_type: "cash_in",
      provider: "gcash",
      amount: 500,
      service_fee: 10,
      drawer_effect: 510,
    });
    // Customer cash-out: shop pays 300 cash; fee deducted in wallet (not cash).
    await saveCashTransaction(ctx, {
      transaction_type: "cash_out",
      provider: "gcash",
      amount: 300,
      service_fee: 5,
      drawer_effect: -300,
    });
    // Wallet top-up from bank: no drawer effect.
    await saveCashTransaction(ctx, {
      transaction_type: "cash_in",
      provider: "gcash",
      amount: 900,
      drawer_effect: 0,
    });
    await saveCashTransaction(ctx, { transaction_type: "cash_in", provider: "gcash", amount: 50 });
    const d = await loadDrawer(STORE);
    expect(d.expectedCents).toBe(121000);
    expect(d.excluded.legacyService).toBe(1);
  });

  it("rejects nonfinite drawer effect", async () => {
    await expect(
      saveCashTransaction(ctx, {
        transaction_type: "cash_in",
        provider: "gcash",
        amount: 5,
        drawer_effect: Number.NaN,
      }),
    ).rejects.toThrow();
  });
});

describe("store isolation", () => {
  it("ignores other stores' rows", () => {
    const now = new Date().toISOString();
    const d = computeDrawer({
      storeId: STORE,
      movements: [
        {
          id: "m",
          store_id: OTHER,
          kind: "count",
          amount: 999,
          reference_type: null,
          reference_id: null,
          notes: null,
          created_by: null,
          created_at: now,
          updated_at: now,
          sync_status: "synced",
        },
      ],
      sales: [],
      payments: [],
      cashTransactions: [],
      expenses: [],
    });
    expect(d.hasBaseline).toBe(false);
  });
});
