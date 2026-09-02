import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

import { AppShell, EmptyState } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSession } from "@/hooks/use-app-session";
import { addDays, formatMoney, formatQty, localDayKey, startOfDay } from "@/lib/format";
import { db } from "@/lib/local-db";

export const Route = createFileRoute("/_authenticated/reports")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reports — BentaKo" },
      { name: "description", content: "Daily sales, profit, expenses, and your best-selling items." },
      { property: "og:title", content: "Reports — BentaKo" },
      { property: "og:description", content: "Simple numbers that show how your store is doing." },
    ],
  }),
  component: ReportsPage,
});

type RangeKey = "7" | "30";

function ReportsPage() {
  const { store } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";
  const [range, setRange] = useState<RangeKey>("7");

  const raw = useLiveQuery(
    async () => {
      if (!storeId) return null;
      const [sales, items, expenses] = await Promise.all([
        db().sales.where("store_id").equals(storeId).toArray(),
        db().sale_items.where("store_id").equals(storeId).toArray(),
        db().expenses.where("store_id").equals(storeId).toArray(),
      ]);
      return { sales, items, expenses };
    },
    [storeId],
    null,
  );

  const report = useMemo(() => {
    if (!raw) return null;
    const days = Number(range);
    const from = startOfDay(addDays(new Date(), -(days - 1)));
    const dayKeys: string[] = [];
    for (let i = 0; i < days; i += 1) dayKeys.push(localDayKey(addDays(from, i)));

    const sales = raw.sales.filter(
      (s) => s.status === "completed" && new Date(s.created_at) >= from,
    );
    const saleIds = new Set(sales.map((s) => s.id));
    const items = raw.items.filter((i) => saleIds.has(i.sale_id));
    const expenses = raw.expenses.filter((e) => e.is_active && dayKeys.includes(e.expense_date));

    const revenue = sales.reduce((s, x) => s + x.total, 0);
    const cost = items.reduce((s, i) => s + i.cost_price_snapshot * i.quantity, 0);
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);

    const perDay = dayKeys.map((key) => {
      const daySales = sales.filter((s) => localDayKey(s.created_at) === key);
      return { key, total: daySales.reduce((s, x) => s + x.total, 0), count: daySales.length };
    });

    const byProduct = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    for (const item of items) {
      const key = item.product_name_snapshot;
      const entry = byProduct.get(key) ?? { name: key, qty: 0, revenue: 0, profit: 0 };
      entry.qty += item.quantity;
      entry.revenue += item.subtotal;
      entry.profit += (item.selling_price_snapshot - item.cost_price_snapshot) * item.quantity;
      byProduct.set(key, entry);
    }

    const byCategory = new Map<string, number>();
    for (const item of items) {
      const key = item.category_name_snapshot ?? "Uncategorized";
      byCategory.set(key, (byCategory.get(key) ?? 0) + item.subtotal);
    }

    return {
      revenue,
      grossProfit: revenue - cost,
      expenseTotal,
      netProfit: revenue - cost - expenseTotal,
      transactions: sales.length,
      average: sales.length ? revenue / sales.length : 0,
      perDay,
      topProducts: [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
      categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [raw, range]);

  const maxDay = Math.max(1, ...(report?.perDay.map((d) => d.total) ?? [1]));

  return (
    <AppShell title="Reports" subtitle={`Last ${range} days`}>
      <div className="space-y-4">
        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="7">7 days</TabsTrigger>
            <TabsTrigger value="30">30 days</TabsTrigger>
          </TabsList>
        </Tabs>

        {!report || report.transactions === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No data yet"
            description="Make a few sales and your reports will fill up automatically."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Revenue" value={formatMoney(report.revenue, currency)} />
              <Metric label="Gross profit" value={formatMoney(report.grossProfit, currency)} />
              <Metric label="Expenses" value={formatMoney(report.expenseTotal, currency)} />
              <Metric label="Net profit" value={formatMoney(report.netProfit, currency)} highlight />
              <Metric label="Sales count" value={String(report.transactions)} />
              <Metric label="Average sale" value={formatMoney(report.average, currency)} />
            </div>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="font-display text-sm font-bold">Daily sales</h2>
              <div className="mt-3 flex h-32 items-end gap-1.5">
                {report.perDay.map((d) => (
                  <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md bg-primary"
                      style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
                      title={`${d.key}: ${formatMoney(d.total, currency)}`}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.key.slice(8)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="font-display text-sm font-bold">Best sellers</h2>
              <ul className="mt-2 divide-y">
                {report.topProducts.map((p) => (
                  <li key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2">
                    <span className="truncate text-sm">{p.name}</span>
                    <span className="tnum shrink-0 text-right text-sm">
                      <span className="font-bold">{formatQty(p.qty)}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(p.revenue, currency)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="font-display text-sm font-bold">Sales by category</h2>
              <ul className="mt-2 space-y-2">
                {report.categories.map(([name, value]) => (
                  <li key={name}>
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{name}</span>
                      <span className="tnum font-semibold">{formatMoney(value, currency)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${Math.max(3, (value / (report.revenue || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-2xl border border-primary/40 bg-primary/10 p-4"
          : "rounded-2xl border bg-card p-4"
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum font-display text-lg font-bold">{value}</p>
    </div>
  );
}
