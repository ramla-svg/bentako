import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Package,
  Receipt,
  ShoppingBasket,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { formatMoney, formatQty, formatTime, localDayKey } from "@/lib/format";
import { db } from "@/lib/local-db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — BentaKo" },
      { name: "description", content: "Today's sales, profit, expenses, and low-stock alerts." },
      { property: "og:title", content: "Dashboard — BentaKo" },
      { property: "og:description", content: "See how your sari-sari store is doing today." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { store, userName, role } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";
  const today = localDayKey();

  const data = useLiveQuery(
    async () => {
      if (!storeId) return null;
      const [sales, items, expenses, products] = await Promise.all([
        db().sales.where("store_id").equals(storeId).toArray(),
        db().sale_items.where("store_id").equals(storeId).toArray(),
        db().expenses.where("store_id").equals(storeId).toArray(),
        db().products.where("store_id").equals(storeId).toArray(),
      ]);
      const todaySales = sales.filter(
        (s) => s.status === "completed" && localDayKey(s.created_at) === today,
      );
      const todayIds = new Set(todaySales.map((s) => s.id));
      const todayItems = items.filter((i) => todayIds.has(i.sale_id));
      const revenue = todaySales.reduce((s, x) => s + x.total, 0);
      const cost = todayItems.reduce((s, i) => s + i.cost_price_snapshot * i.quantity, 0);
      const todayExpenses = expenses
        .filter((e) => e.is_active && e.expense_date === today)
        .reduce((s, e) => s + e.amount, 0);
      const active = products.filter((p) => p.is_active);
      return {
        revenue,
        profit: revenue - cost,
        transactions: todaySales.length,
        itemsSold: todayItems.reduce((s, i) => s + i.quantity, 0),
        expenses: todayExpenses,
        lowStock: active.filter(
          (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold,
        ),
        outOfStock: active.filter((p) => p.stock_quantity <= 0),
        recent: [...todaySales].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
      };
    },
    [storeId, today],
    null,
  );

  const alerts = (data?.lowStock.length ?? 0) + (data?.outOfStock.length ?? 0);

  return (
    <AppShell
      title={`Kumusta, ${userName?.split(" ")[0] ?? "boss"}!`}
      subtitle={`${store?.name ?? ""} · ${role === "owner" ? "Owner" : "Cashier"}`}
    >
      <div className="space-y-4">
        <div className="rounded-3xl bg-primary p-5 text-primary-foreground">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Sales today</p>
          <p className="tnum font-display text-4xl font-extrabold">
            {formatMoney(data?.revenue ?? 0, currency)}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat label="Profit" value={formatMoney(data?.profit ?? 0, currency)} />
            <MiniStat label="Sales" value={String(data?.transactions ?? 0)} />
            <MiniStat label="Items" value={formatQty(data?.itemsSold ?? 0)} />
          </div>
          <Button asChild variant="secondary" className="mt-4 h-12 w-full text-base">
            <Link to="/pos">
              <ShoppingBasket className="size-5" /> Start new sale
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            to="/expenses"
            icon={Wallet}
            label="Expenses today"
            value={formatMoney(data?.expenses ?? 0, currency)}
          />
          <StatCard
            to="/inventory"
            icon={AlertTriangle}
            label="Stock alerts"
            value={String(alerts)}
            tone={alerts > 0 ? "warning" : "default"}
          />
        </div>

        {alerts > 0 ? (
          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">Needs restocking</h2>
              <Link to="/inventory" className="text-xs font-medium text-primary">
                View all
              </Link>
            </div>
            <ul className="mt-2 divide-y">
              {[...(data?.outOfStock ?? []), ...(data?.lowStock ?? [])].slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-sm">{p.name}</span>
                  <span
                    className={cn(
                      "tnum shrink-0 text-xs font-semibold",
                      p.stock_quantity <= 0 ? "text-destructive" : "text-accent-foreground",
                    )}
                  >
                    {p.stock_quantity <= 0 ? "Out of stock" : `${formatQty(p.stock_quantity)} left`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Latest sales</h2>
            <Link to="/sales" className="text-xs font-medium text-primary">
              History
            </Link>
          </div>
          {(data?.recent.length ?? 0) === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No sales yet today.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {data?.recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.transaction_number}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(s.created_at)}</p>
                  </div>
                  <span className="tnum shrink-0 text-sm font-bold">
                    {formatMoney(s.total, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Shortcut to="/products" icon={Package} label="Products" />
          <Shortcut to="/inventory" icon={Boxes} label="Inventory" />
          <Shortcut to="/sales" icon={Receipt} label="Sales" />
          <Shortcut to="/reports" icon={BarChart3} label="Reports" />
        </div>
      </div>
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-primary-foreground/15 py-2">
      <p className="opacity-80">{label}</p>
      <p className="tnum font-display text-sm font-bold">{value}</p>
    </div>
  );
}

function StatCard({
  to,
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  to: "/expenses" | "/inventory";
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "rounded-2xl border bg-card p-4 transition-colors active:bg-accent/10",
        tone === "warning" && "border-warning/50 bg-warning/10",
      )}
    >
      <Icon className={cn("size-5", tone === "warning" ? "text-accent-foreground" : "text-primary")} />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      <p className="tnum font-display text-lg font-bold">{value}</p>
    </Link>
  );
}

function Shortcut({
  to,
  icon: Icon,
  label,
}: {
  to: "/products" | "/inventory" | "/sales" | "/reports";
  icon: typeof Package;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-2xl border bg-card p-4 text-sm font-semibold"
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        {label}
      </span>
      <ArrowUpRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
