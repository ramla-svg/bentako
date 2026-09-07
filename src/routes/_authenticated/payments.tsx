import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";

import { AppShell, EmptyState } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSession } from "@/hooks/use-app-session";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  db,
  type LocalCustomer,
  type LocalCustomerPayment,
  type LocalSale,
  type PaymentMethod,
} from "@/lib/local-db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/payments")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Payments — BentaKo" },
      {
        name: "description",
        content: "Every payment received — cash, GCash, Maya, bank and utang repayments.",
      },
      { property: "og:title", content: "Payments — BentaKo" },
      { property: "og:description", content: "Check the drawer and each wallet at closing time." },
    ],
  }),
  component: PaymentsPage,
});

type RangeKey = "today" | "7d" | "30d";
type FilterKey = "all" | PaymentMethod;

const TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
  other: "Other",
  utang: "Utang payment",
};

const FILTERS: FilterKey[] = ["all", "cash", "gcash", "maya", "bank", "utang", "other"];

function rangeStart(range: RangeKey): number {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

type Row = {
  id: string;
  created_at: string;
  type: string;
  label: string;
  amount: number;
  saleId: string | null;
};

function PaymentsPage() {
  const { store } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [range, setRange] = useState<RangeKey>("today");
  const [filter, setFilter] = useState<FilterKey>("all");

  const sales = useLiveQuery(
    async () => (storeId ? await db().sales.where("store_id").equals(storeId).toArray() : []),
    [storeId],
    [] as LocalSale[],
  );

  const ledger = useLiveQuery(
    async () =>
      storeId ? await db().customer_payments.where("store_id").equals(storeId).toArray() : [],
    [storeId],
    [] as LocalCustomerPayment[],
  );

  const customers = useLiveQuery(
    async () => (storeId ? await db().customers.where("store_id").equals(storeId).toArray() : []),
    [storeId],
    [] as LocalCustomer[],
  );

  const from = rangeStart(range);

  const rows = useMemo<Row[]>(() => {
    const names = new Map((customers ?? []).map((c) => [c.id, c.name]));
    const out: Row[] = [];
    for (const s of sales ?? []) {
      if (s.status !== "completed") continue;
      if (s.payment_method === "utang") continue; // nothing received yet
      if (new Date(s.created_at).getTime() < from) continue;
      out.push({
        id: s.id,
        created_at: s.created_at,
        type: s.payment_method,
        label: `Sale ${s.transaction_number}`,
        amount: s.total,
        saleId: s.id,
      });
    }
    for (const l of ledger ?? []) {
      if (l.amount <= 0) continue; // manual charges are not payments
      if (new Date(l.created_at).getTime() < from) continue;
      out.push({
        id: l.id,
        created_at: l.created_at,
        type: "utang",
        label: names.get(l.customer_id) ?? "Utang payment",
        amount: l.amount,
        saleId: null,
      });
    }
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [sales, ledger, customers, from]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.type, (map.get(r.type) ?? 0) + r.amount);
    return map;
  }, [rows]);

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const filtered = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  return (
    <AppShell title="Payments" subtitle={`Received ${formatMoney(grandTotal, currency)}`}>
      <div className="space-y-3">
        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[...totals.entries()].map(([type, value]) => (
            <div key={type} className="rounded-2xl border bg-card p-3">
              <p className="truncate text-[11px] font-medium text-muted-foreground">
                {TYPE_LABELS[type] ?? type}
              </p>
              <p className="tnum truncate font-display text-base font-bold">
                {formatMoney(value, currency)}
              </p>
            </div>
          ))}
        </div>

        <div className="scroll-rail -mx-4 flex gap-2 px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium",
                filter === f ? "bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {f === "all" ? "All" : (TYPE_LABELS[f] ?? f)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No payments in this period"
            description="Completed sales and utang repayments show up here."
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => {
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {TYPE_LABELS[r.type] ?? r.type} · {formatDateTime(r.created_at)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-display text-base font-bold">
                    {formatMoney(r.amount, currency)}
                  </span>
                </>
              );
              return (
                <li key={r.id}>
                  {r.saleId ? (
                    <Link
                      to="/sales"
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3 active:bg-accent/10"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
