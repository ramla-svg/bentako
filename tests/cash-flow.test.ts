import { beforeEach, describe, expect, it } from "vitest";
import {
  physicalCashEffect,
  recordedWalletBalance,
  serviceKindOf,
  suggestedPhysicalCash,
  walletDirection,
} from "@/lib/cash-flow";
import { db } from "@/lib/local-db";
import { loadDrawer, recordCashCount, saveCashTransaction, walletBalance } from "@/lib/repo";
import { ctx, OTHER, resetDb, STORE } from "./helpers";

beforeEach(resetDb);

describe("GCash customer service flow", () => {
  it("customer Cash In spends GCash and receives physical cash plus a cash fee", async () => {
    expect(walletDirection("cash_in")).toBe("cash_out");
    expect(suggestedPhysicalCash("cash_in")).toBe("in");
    const row = await saveCashTransaction(ctx, {
      // The mutation must enforce the correct wallet direction even for a stale caller.
      transaction_type: "cash_in",
      service_kind: "cash_in",
      provider: "gcash",
      amount: 500,
      service_fee: 10,
      drawer_effect: physicalCashEffect("in", 500, 10),
    });
    expect([row.transaction_type, row.drawer_effect]).toEqual(["cash_out", 510]);
    expect(serviceKindOf(row)).toBe("cash_in");
    expect(await walletBalance(STORE)).toBe(-500);
    const queued = await db().sync_queue.where("entity_id").equals(row.id).first();
    expect(queued?.payload.service_kind).toBe("cash_in");
    expect(queued?.payload.transaction_type).toBe("cash_out");
  });

  it("customer Cash Out receives GCash and gives physical cash", async () => {
    expect(walletDirection("cash_out")).toBe("cash_in");
    expect(suggestedPhysicalCash("cash_out")).toBe("out");
    const row = await saveCashTransaction(ctx, {
      transaction_type: "cash_out",
      service_kind: "cash_out",
      provider: "gcash",
      amount: 300,
      service_fee: 5,
      drawer_effect: physicalCashEffect("out", 300),
    });
    expect([row.transaction_type, row.drawer_effect]).toEqual(["cash_in", -300]);
    expect(serviceKindOf(row)).toBe("cash_out");
    expect(await walletBalance(STORE)).toBe(300);
  });

  it("Cash Out with a separately cash-collected fee deducts only net physical cash", () => {
    expect(physicalCashEffect("out", 300, 5)).toBe(-295);
  });

  it("Add Balance increases GCash without physical cash for bank/online funding", async () => {
    expect(suggestedPhysicalCash("add_balance", "Bank")).toBe("none");
    expect(suggestedPhysicalCash("add_balance", "GCash app")).toBe("none");
    const row = await saveCashTransaction(ctx, {
      transaction_type: walletDirection("add_balance"),
      service_kind: "add_balance",
      provider: "gcash",
      amount: 1000,
      drawer_effect: physicalCashEffect("none", 1000),
    });
    expect([row.transaction_type, row.drawer_effect]).toEqual(["cash_in", 0]);
    expect(serviceKindOf(row)).toBe("add_balance");
    expect(await walletBalance(STORE)).toBe(1000);
  });

  it("Add Balance funded with physical cash takes cash out, not in", () => {
    const move = suggestedPhysicalCash("add_balance", "Cash on hand");
    expect(move).toBe("out");
    expect(physicalCashEffect(move, 1000)).toBe(-1000);
  });

  it.each(["buy_load", "pay_bills"] as const)(
    "%s spends GCash and receives customer cash",
    async (kind) => {
      expect(walletDirection(kind)).toBe("cash_out");
      expect(suggestedPhysicalCash(kind)).toBe("in");
      const row = await saveCashTransaction(ctx, {
        transaction_type: "cash_in",
        service_kind: kind,
        provider: "gcash",
        amount: 75,
        drawer_effect: physicalCashEffect("in", 75),
      });
      expect([row.transaction_type, row.drawer_effect]).toEqual(["cash_out", 75]);
      expect(serviceKindOf(row)).toBe(kind);
      expect(await walletBalance(STORE)).toBe(-75);
    },
  );

  it("uses cents precision for physical cash and wallet totals", async () => {
    expect(physicalCashEffect("out", 0.3, 0.1)).toBe(-0.2);
    for (const amount of [0.1, 0.2])
      await saveCashTransaction(ctx, {
        transaction_type: "cash_in",
        service_kind: "add_balance",
        provider: "gcash",
        amount,
      });
    expect(await walletBalance(STORE)).toBe(0.3);
  });

  it("new service labels never come from notes or wallet direction", async () => {
    const row = await saveCashTransaction(ctx, {
      transaction_type: "cash_in",
      service_kind: "cash_in",
      provider: "gcash",
      amount: 100,
      notes: "Add balance · Bank",
    });
    expect(serviceKindOf(row)).toBe("cash_in");
    expect(row.transaction_type).toBe("cash_out");
  });

  it("keeps ambiguous legacy wallet directions and records untouched", async () => {
    const old = await saveCashTransaction(ctx, {
      transaction_type: "cash_in",
      provider: "gcash",
      amount: 100,
    });
    await db().cash_transactions.update(old.id, { service_kind: undefined });
    const snapshot = await db().cash_transactions.get(old.id);
    await saveCashTransaction(ctx, {
      transaction_type: "cash_out",
      service_kind: "cash_in",
      provider: "gcash",
      amount: 30,
    });
    expect(await walletBalance(STORE)).toBe(70);
    expect(await db().cash_transactions.get(old.id)).toEqual(snapshot);
  });

  it("excludes voided, other-store and physical-only rows from shared wallet totals", async () => {
    const mine = await saveCashTransaction(ctx, {
      transaction_type: "cash_in",
      service_kind: "add_balance",
      provider: "gcash",
      amount: 10,
    });
    const voided = await saveCashTransaction(ctx, {
      transaction_type: "cash_in",
      service_kind: "add_balance",
      provider: "gcash",
      amount: 20,
    });
    await db().cash_transactions.update(voided.id, { status: "voided" });
    await db().cash_transactions.put({ ...mine, id: "other-store", store_id: OTHER, amount: 500 });
    await db().cash_transactions.put({
      ...mine,
      id: "physical-only",
      provider: "other",
      amount: 50,
    });
    expect(recordedWalletBalance(await db().cash_transactions.toArray(), STORE)).toBe(10);
    expect(await walletBalance(STORE)).toBe(10);
  });

  it("wallet and counted physical cash stay independent across an entire service flow", async () => {
    const count = await recordCashCount(ctx, { counted: 1000 });
    // Fixture count predates the service rows, without depending on wall-clock resolution.
    await db().cash_drawer_movements.update(count.id, { created_at: "2026-01-01T00:00:00.000Z" });
    for (const [kind, amount, move, fee] of [
      ["add_balance", 2000, "none", 0],
      ["cash_in", 500, "in", 10],
      ["cash_out", 300, "out", 0],
      ["buy_load", 100, "in", 0],
    ] as const)
      await saveCashTransaction(ctx, {
        transaction_type: walletDirection(kind),
        service_kind: kind,
        provider: "gcash",
        amount,
        service_fee: fee,
        drawer_effect: physicalCashEffect(move, amount, fee),
      });
    expect(await walletBalance(STORE)).toBe(1700);
    const drawer = await loadDrawer(STORE);
    expect(drawer.expectedCents).toBe(131000);
    expect(drawer.events.filter((e) => e.source === "service").map((e) => e.label)).toContain(
      "GCash/e-wallet cash in",
    );
  });
});
