import { describe, expect, it, vi } from "vitest";

import {
  assertAdminEmail,
  buildStoreList,
  canSubmitRevoke,
  computeAdminMetrics,
  fetchAllPages,
  manilaMonthKey,
  revokeStorePro,
  subscriberStatus,
  validateRevokeInput,
  type AdminPaymentRow,
  type AdminStoreRow,
} from "@/lib/admin-subscriptions";

const ADMINS = ["boss@example.com"];
const admin = { email: "Boss@example.com" };
const owner = { email: "shop@example.com" };
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2027-01-10T04:00:00Z");

const store = (p: Partial<AdminStoreRow>): AdminStoreRow => ({
  id: S1,
  name: "A",
  owner_id: "o",
  owner_name: null,
  plan: "free",
  plan_period: null,
  plan_expires_at: null,
  plan_source: null,
  created_at: "2026-01-01T00:00:00Z",
  ...p,
});
const pay = (p: Partial<AdminPaymentRow>): AdminPaymentRow => ({
  store_id: S1,
  amount: 99,
  status: "approved",
  plan_period: "monthly",
  created_at: "2027-01-05T00:00:00Z",
  reviewed_at: "2027-01-05T00:00:00Z",
  requested_by_email: null,
  ...p,
});

describe("admin access", () => {
  it("rejects non-admin shop owners", () => {
    expect(() => assertAdminEmail(owner, ADMINS)).toThrow("Forbidden");
    expect(() => assertAdminEmail({}, ADMINS)).toThrow("Forbidden");
    expect(assertAdminEmail(admin, ADMINS)).toBe("boss@example.com");
  });
  it("non-admin revoke never reaches the database", async () => {
    const revokeAtomic = vi.fn();
    await expect(
      revokeStorePro({ revokeAtomic }, owner, ADMINS, "u", {
        storeId: S1,
        reason: "test",
        expectedExpiresAt: null,
      }),
    ).rejects.toThrow("Forbidden");
    expect(revokeAtomic).not.toHaveBeenCalled();
  });
});

describe("revoke", () => {
  it("targets only the given store and passes the expected expiry", async () => {
    const revokeAtomic = vi.fn().mockResolvedValue({ status: "revoked" });
    const r = await revokeStorePro({ revokeAtomic }, admin, ADMINS, "actor", {
      storeId: S2,
      reason: " refund asked ",
      expectedExpiresAt: "2027-02-01T00:00:00Z",
    });
    expect(r.status).toBe("revoked");
    expect(revokeAtomic).toHaveBeenCalledTimes(1);
    expect(revokeAtomic.mock.calls[0][0]).toMatchObject({
      storeId: S2,
      reason: "refund asked",
      actorId: "actor",
      actorEmail: "boss@example.com",
    });
  });
  it("repeat and stale are reported, failures propagate", async () => {
    for (const status of ["already_free", "stale", "not_found"]) {
      const r = await revokeStorePro(
        { revokeAtomic: async () => ({ status }) },
        admin,
        ADMINS,
        "a",
        {
          storeId: S1,
          reason: "xyz",
          expectedExpiresAt: null,
        },
      );
      expect(r.status).toBe(status);
    }
    await expect(
      revokeStorePro(
        {
          revokeAtomic: async () => {
            throw new Error("db down");
          },
        },
        admin,
        ADMINS,
        "a",
        {
          storeId: S1,
          reason: "xyz",
          expectedExpiresAt: null,
        },
      ),
    ).rejects.toThrow("db down");
  });
  it("validates id and reason", () => {
    expect(() => validateRevokeInput({ storeId: "x", reason: "abc" })).toThrow();
    expect(() => validateRevokeInput({ storeId: S1, reason: " a " })).toThrow();
  });
  it("dialog gating", () => {
    expect(canSubmitRevoke("", false)).toBe(false);
    expect(canSubmitRevoke("ok!", true)).toBe(false);
    expect(canSubmitRevoke("ok!", false)).toBe(true);
  });
});

describe("metrics", () => {
  it("status uses expiry plus 14-day grace", () => {
    expect(
      subscriberStatus(store({ plan: "pro", plan_expires_at: "2027-01-01T00:00:00Z" }), NOW),
    ).toBe("pro_active");
    expect(
      subscriberStatus(store({ plan: "pro", plan_expires_at: "2026-12-01T00:00:00Z" }), NOW),
    ).toBe("pro_expired");
    expect(subscriberStatus(store({ plan: "free" }), NOW)).toBe("free");
  });
  it("Manila month boundary and year rollover", () => {
    expect(manilaMonthKey("2026-12-31T16:30:00Z")).toBe("2027-01");
    expect(manilaMonthKey("2026-12-31T15:59:00Z")).toBe("2026-12");
  });
  it("counts only approved, by approval date, across >120 rows, with cents", () => {
    const payments: AdminPaymentRow[] = [];
    for (let i = 0; i < 150; i++) payments.push(pay({ amount: "0.10" }));
    payments.push(pay({ status: "pending", amount: 999 }));
    payments.push(pay({ status: "rejected", amount: 999 }));
    // Approved in December (Manila), sent in November.
    payments.push(
      pay({
        amount: 999,
        plan_period: "yearly",
        created_at: "2026-11-20T00:00:00Z",
        reviewed_at: "2026-12-31T15:00:00Z",
      }),
    );
    // Same year number, different year: must not count as this January.
    payments.push(
      pay({ amount: 99, created_at: "2026-01-05T00:00:00Z", reviewed_at: "2026-01-05T00:00:00Z" }),
    );
    payments.push(pay({ amount: 99, created_at: "2026-08-01T00:00:00Z", reviewed_at: null }));
    const m = computeAdminMetrics(
      [
        store({}),
        store({
          id: S2,
          plan: "pro",
          plan_period: "yearly",
          plan_expires_at: "2027-06-01T00:00:00Z",
        }),
      ],
      payments,
      NOW,
    );
    expect(m.currentMonthCents).toBe(1500);
    expect(m.previousMonthCents).toBe(99900);
    expect(m.approvedCount).toBe(153);
    expect(m.approvedTotalCents).toBe(1500 + 99900 + 9900 + 9900);
    expect(m.pendingPayments).toBe(1);
    expect(m.fallbackDatedCount).toBe(1);
    expect(m.trend.map((t) => t.month)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
    expect(m.trend[0].cents).toBe(9900);
    expect(m).toMatchObject({ totalStores: 2, activePro: 1, freeStores: 1, activeYearly: 1 });
  });
  it("fetchAllPages reads past the page size", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const all = await fetchAllPages(async (f, t) => ({ data: rows.slice(f, t + 1), error: null }));
    expect(all.length).toBe(2500);
  });
});

describe("store list identity and order", () => {
  const stores = [
    store({ id: S2, owner_id: "owner-b", name: "B", created_at: "2026-05-01T00:00:00Z" }),
    store({ id: S1, owner_id: "owner-a", name: "A", created_at: "2026-05-01T00:00:00Z" }),
  ];
  const users = [
    { id: "owner-a", email: "real-a@example.com" },
    { id: "owner-b", email: "real-b@example.com" },
  ];
  const payments = [pay({ store_id: S1, requested_by_email: "helper@example.com" })];

  it("owner email comes from the owner account, not the payment sender", () => {
    const rows = buildStoreList(stores, payments, users, NOW, { q: "", status: null });
    const a = rows.find((r) => r.id === S1)!;
    expect(a.owner_email).toBe("real-a@example.com");
    expect(a.payment_contact).toBe("helper@example.com");
    expect(buildStoreList(stores, payments, users, NOW, { q: "helper@", status: null })).toEqual(
      [],
    );
    expect(buildStoreList(stores, payments, users, NOW, { q: "real-b", status: null })[0].id).toBe(
      S2,
    );
  });
  it("equal timestamps are ordered by id, so pages never skip or repeat", () => {
    const ids = buildStoreList(stores, [], users, NOW, { q: "", status: null }).map((r) => r.id);
    expect(ids).toEqual([S1, S2]);
  });
});
