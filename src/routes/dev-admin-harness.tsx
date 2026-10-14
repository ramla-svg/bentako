// TEMPORARY visual harness with mocked data; deleted after verification.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminOverview, AdminStores } from "@/components/admin-subscriptions-panel";
import { computeAdminMetrics, buildStoreList } from "@/lib/admin-subscriptions";

const now = Date.now();
const stores = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Aling Nena Sari-Sari Store na may napakahabang pangalan", owner_id: "a", owner_name: "Nena Cruz", plan: "pro", plan_period: "yearly", plan_expires_at: new Date(now + 9e9).toISOString(), plan_source: "gcash_manual", created_at: "2026-01-01T00:00:00Z" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Tindahan ni Mang Jose", owner_id: "b", owner_name: "Jose", plan: "pro", plan_period: "monthly", plan_expires_at: new Date(now - 30 * 864e5).toISOString(), plan_source: "gcash_manual", created_at: "2026-02-01T00:00:00Z" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Libre Store", owner_id: "c", owner_name: null, plan: "free", plan_period: null, plan_expires_at: null, plan_source: null, created_at: "2026-03-01T00:00:00Z" },
];
const payments = [
  { store_id: stores[0].id, amount: 999, status: "approved", plan_period: "yearly", created_at: new Date(now).toISOString(), reviewed_at: new Date(now).toISOString(), requested_by_email: "helper@example.com" },
  { store_id: stores[1].id, amount: 99, status: "approved", plan_period: "monthly", created_at: new Date(now - 40 * 864e5).toISOString(), reviewed_at: null, requested_by_email: null },
  { store_id: stores[1].id, amount: 99, status: "pending", plan_period: "monthly", created_at: new Date(now).toISOString(), reviewed_at: null, requested_by_email: null },
];
const users = [{ id: "a", email: "nena@example.com" }, { id: "b", email: "jose@example.com" }];

export const Route = createFileRoute("/dev-admin-harness")({ ssr: false, component: Harness });

function Harness() {
  const [v, setV] = useState(0);
  const w = window as unknown as { __mode?: string; __calls: unknown[] };
  w.__calls ??= [];
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <AdminOverview version={v} api={{ load: async () => computeAdminMetrics(stores, payments, now) }} />
      <AdminStores
        version={v}
        onChanged={() => setV((x) => x + 1)}
        api={{
          list: async ({ data }) => {
            const all = buildStoreList(stores, payments, users, now, { q: data.q, status: (data.status || null) as never });
            return { items: all, total: all.length, pageSize: 25 };
          },
          revoke: async ({ data }) => {
            w.__calls.push(data);
            await new Promise((r) => setTimeout(r, 400));
            if (w.__mode === "error") throw new Error("Mock failure");
            return { status: w.__mode ?? "revoked" };
          },
        }}
      />
    </div>
  );
}
