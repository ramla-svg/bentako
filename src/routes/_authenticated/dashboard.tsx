import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronRight,
  HandCoins,
  Package,
  Receipt,
  ShoppingCart,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PlanReminder } from "@/components/plan-reminder";

import { useAppSession } from "@/hooks/use-app-session";
import { formatDate, formatMoney, formatQty, formatTime, localDayKey } from "@/lib/format";
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

function dayKeyOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDayKey(d);
}

function Dashboard() {
  const { store, userName, role } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";
  const today = localDayKey();

  const data = useLiveQuery(
    async () => {
      if (!storeId) return null;
      const [sales, items, expenses, products, cash, ledger] = await Promise.all([
        db().sales.where("store_id").equals(storeId).toArray(),
        db().sale_items.where("store_id").equals(storeId).toArray(),
        db().expenses.where("store_id").equals(storeId).toArray(),
        db().products.where("store_id").equals(storeId).toArray(),
        db().cash_transactions.where("store_id").equals(storeId).toArray(),
        db().customer_payments.where("store_id").equals(storeId).toArray(),
      ]);
      const completed = sales.filter((s) => s.status === "completed");
      const todaySales = completed.filter((s) => localDayKey(s.created_at) === today);
      const todayIds = new Set(todaySales.map((s) => s.id));
      const todayItems = items.filter((i) => todayIds.has(i.sale_id));
      const revenue = todaySales.reduce((s, x) => s + x.total, 0);
      const cost = todayItems.reduce((s, i) => s + i.cost_price_snapshot * i.quantity, 0);
      const yesterdayKey = dayKeyOffset(1);
      const yesterday = completed
        .filter((s) => localDayKey(s.created_at) === yesterdayKey)
        .reduce((s, x) => s + x.total, 0);

      const series = Array.from({ length: 7 }, (_, idx) => {
        const key = dayKeyOffset(6 - idx);
        return completed
          .filter((s) => localDayKey(s.created_at) === key)
          .reduce((sum, s) => sum + s.total, 0);
      });

      const active = products.filter((p) => p.is_active);
      const walletIn = cash
        .filter((c) => c.provider !== "other" && c.transaction_type === "cash_in")
        .reduce((s, c) => s + c.amount, 0);
      const walletOut = cash
        .filter((c) => c.provider !== "other" && c.transaction_type === "cash_out")
        .reduce((s, c) => s + c.amount, 0);
      const utangCharges = completed
        .filter((s) => s.payment_method === "utang")
        .reduce((s, x) => s + x.total, 0);
      const utangLedger = ledger.reduce((s, l) => s + l.amount, 0);

      const itemCount = new Map<string, number>();
      for (const i of items) itemCount.set(i.sale_id, (itemCount.get(i.sale_id) ?? 0) + i.quantity);

      return {
        revenue,
        yesterday,
        series,
        profit: revenue - cost,
        transactions: todaySales.length,
        itemsSold: todayItems.reduce((s, i) => s + i.quantity, 0),
        expenses: expenses
          .filter((e) => e.is_active && e.expense_date === today)
          .reduce((s, e) => s + e.amount, 0),
        walletBalance: walletIn - walletOut,
        utangTotal: Math.max(0, utangCharges - utangLedger),
        lowStock: active.filter(
          (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold,
        ),
        outOfStock: active.filter((p) => p.stock_quantity <= 0),
        recent: [...todaySales]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5)
          .map((s) => ({ ...s, items: itemCount.get(s.id) ?? 0 })),
      };
    },
    [storeId, today],
    null,
  );

  const alerts = (data?.lowStock.length ?? 0) + (data?.outOfStock.length ?? 0);
  const revenue = data?.revenue ?? 0;
  const yesterday = data?.yesterday ?? 0;
  const change = yesterday > 0 ? Math.round(((revenue - yesterday) / yesterday) * 100) : null;
  const peak = Math.max(1, ...(data?.series ?? [1]));

  return (
    <AppShell
      brand
      alerts={alerts}
      title={`Kumusta, ${userName?.split(" ")[0] ?? "boss"}!`}
      subtitle={`${userName ?? store?.name ?? ""} · ${role === "owner" ? "Owner" : "Cashier"}`}
    >
      <div className="space-y-3 sm:space-y-5">
        <PlanReminder />
        {/* Sales today */}

        <div className="min-w-0 rounded-2xl bg-primary p-3 text-primary-foreground sm:rounded-3xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
                Sales today
              </p>
              <p className="tnum truncate font-display text-xl font-extrabold sm:text-fluid-amount">
                {formatMoney(revenue, currency)}
              </p>
              {change === null ? null : (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-90 sm:text-xs">
                  {change >= 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : (
                    <TrendingDown className="size-3.5" />
                  )}
                  {change >= 0 ? "+" : ""}
                  {change}% vs yesterday
                </p>
              )}
            </div>
            <Link
              to="/sales"
              className="flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-1 text-[10px] font-medium sm:px-2.5 sm:text-xs"
            >
              {formatDate(new Date().toISOString())}
              <ChevronRight className="size-3.5" />
            </Link>
          </div>

          <div className="mt-2 flex h-6 items-end gap-1.5 opacity-40 sm:mt-3 sm:h-10" aria-hidden>
            {(data?.series ?? []).map((v, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-sm bg-primary-foreground"
                style={{ height: `${Math.max(8, (v / peak) * 100)}%` }}
              />
            ))}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] sm:mt-3 sm:gap-2 sm:text-xs">
            <MiniStat label="Profit" value={formatMoney(data?.profit ?? 0, currency)} />
            <MiniStat label="Transactions" value={String(data?.transactions ?? 0)} />
            <MiniStat label="Items Sold" value={formatQty(data?.itemsSold ?? 0)} />
          </div>

          <Link
            to="/pos"
            className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary-foreground font-display text-sm font-bold text-primary active:opacity-90 sm:mt-4 sm:h-12 sm:rounded-2xl sm:text-base"
          >
            <ShoppingCart className="size-4.5 sm:size-5" /> New Sale
          </Link>
        </div>

        {/* Today at a glance */}
        <section>
          <SectionHead title="Today at a glance" to="/reports" />
          <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:mt-2 sm:gap-2">
            <GlanceCard
              to="/expenses"
              icon={Wallet}
              tint="mint"
              label="Expenses"
              value={formatMoney(data?.expenses ?? 0, currency)}
            />
            <GlanceCard
              to="/inventory"
              icon={AlertTriangle}
              tint="peach"
              label="Low Stock"
              value={alerts === 1 ? "1 item" : `${alerts} items`}
              highlight={alerts > 0}
            />
            <GlanceCard
              to="/cash"
              icon={Smartphone}
              tint="blue"
              label="GCash"
              value={formatMoney(data?.walletBalance ?? 0, currency)}
            />
            <GlanceCard
              to="/utang"
              icon={HandCoins}
              tint="lavender"
              label="Utang"
              value={formatMoney(data?.utangTotal ?? 0, currency)}
            />
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <SectionHead title="Quick actions" to="/more" label="See all" />
          <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:mt-2 sm:gap-3">
            <ActionTile to="/products" icon={Package} tint="mint" label="Products" />
            <ActionTile to="/inventory" icon={Boxes} tint="sky" label="Inventory" />
            <ActionTile to="/cash" icon={Smartphone} tint="blue" label="GCash Cash In/Out" />
            
            <ActionTile to="/expenses" icon={Wallet} tint="rose" label="Expenses" />
            <ActionTile to="/sales" icon={Receipt} tint="mint" label="Sales" />
            <ActionTile to="/reports" icon={BarChart3} tint="lavender" label="Reports" />
            <ActionTile to="/utang" icon={HandCoins} tint="mint" label="Customers (Utang)" />
          </div>
        </section>

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

        {/* Recent transactions */}
        <section>
          <SectionHead title="Recent transactions" to="/sales" />
          {(data?.recent.length ?? 0) === 0 ? (
            <p className="mt-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              No sales yet today.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data?.recent.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/sales"
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tile-mint text-tile-mint-ink">
                      <ShoppingCart className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.transaction_number}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Sale · {formatTime(s.created_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block font-display font-bold">
                        {formatMoney(s.total, currency)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatQty(s.items)} {s.items === 1 ? "item" : "items"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function SectionHead({
  title,
  to,
  label = "View all",
}: {
  title: string;
  to: "/sales" | "/reports" | "/more";
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="truncate font-display text-sm font-bold sm:text-base">{title}</h2>
      <Link to={to} className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
        {label}
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}

type Tint = "mint" | "sky" | "rose" | "lavender" | "peach" | "blue";

const TINT: Record<Tint, string> = {
  mint: "bg-tile-mint text-tile-mint-ink",
  sky: "bg-tile-sky text-tile-sky-ink",
  rose: "bg-tile-rose text-tile-rose-ink",
  lavender: "bg-tile-lavender text-tile-lavender-ink",
  peach: "bg-tile-peach text-tile-peach-ink",
  blue: "bg-tile-blue text-tile-blue-ink",
};

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-primary-foreground/15 px-1.5 py-1.5 sm:rounded-xl sm:px-2 sm:py-2">
      <p className="truncate opacity-80">{label}</p>
      <p className="tnum truncate font-display text-xs font-bold sm:text-sm">{value}</p>
    </div>
  );
}

type GlanceTo = "/expenses" | "/inventory" | "/cash" | "/utang";

function GlanceCard({
  to,
  icon: Icon,
  tint,
  label,
  value,
  highlight = false,
}: {
  to: GlanceTo;
  icon: typeof Wallet;
  tint: Tint;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-1 py-2 text-center sm:flex-row sm:gap-2.5 sm:rounded-2xl sm:p-3 sm:text-left",
        highlight && "border-warning/50 bg-warning/10",
      )}
    >
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg sm:size-9 sm:rounded-full", TINT[tint])}>
        <Icon className="size-3.5 sm:size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[9px] text-muted-foreground sm:text-xs">{label}</span>
        <span className="tnum block truncate font-display text-[10px] font-bold sm:text-sm">{value}</span>
      </span>
    </Link>
  );
}

type ActionTo = GlanceTo | "/products" | "/sales" | "/reports";

function ActionTile({
  to,
  icon: Icon,
  tint,
  label,
}: {
  to: ActionTo;
  icon: typeof Package;
  tint: Tint;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1 py-2 text-center active:opacity-90 sm:min-h-24 sm:items-start sm:justify-between sm:rounded-2xl sm:p-3.5 sm:text-left"
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TINT[tint])}>
        <Icon className="size-4.5 sm:size-5" />
      </span>
      <span className="line-clamp-2 font-display text-[9px] font-bold leading-tight sm:text-sm">{label}</span>
    </Link>
  );
}
