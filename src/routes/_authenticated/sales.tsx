import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Ban, Receipt, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSession } from "@/hooks/use-app-session";
import { formatDateTime, formatMoney, formatQty, localDayKey } from "@/lib/format";
import { db, type LocalSale, type LocalSaleItem } from "@/lib/local-db";
import { voidSale } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sales")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sales history — SariPOS" },
      { name: "description", content: "Browse past transactions, view receipts, and void mistakes." },
      { property: "og:title", content: "Sales history — SariPOS" },
      { property: "og:description", content: "Every sale saved on this device, synced when online." },
    ],
  }),
  component: SalesPage,
});

type RangeKey = "today" | "week" | "all";

function SalesPage() {
  const { store, ctx, role } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [range, setRange] = useState<RangeKey>("today");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<LocalSale | null>(null);
  const [toVoid, setToVoid] = useState<LocalSale | null>(null);

  const sales = useLiveQuery(
    async () =>
      storeId
        ? (await db().sales.where("store_id").equals(storeId).toArray()).sort((a, b) =>
            b.created_at.localeCompare(a.created_at),
          )
        : [],
    [storeId],
    [] as LocalSale[],
  );

  const items = useLiveQuery(
    async () =>
      detail ? await db().sale_items.where("sale_id").equals(detail.id).toArray() : [],
    [detail?.id],
    [] as LocalSaleItem[],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = localDayKey();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    return (sales ?? []).filter((s) => {
      if (range === "today" && localDayKey(s.created_at) !== today) return false;
      if (range === "week" && new Date(s.created_at) < weekAgo) return false;
      if (q && !s.transaction_number.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sales, range, search]);

  const totals = useMemo(() => {
    const completed = filtered.filter((s) => s.status === "completed");
    return {
      count: completed.length,
      revenue: completed.reduce((s, x) => s + x.total, 0),
    };
  }, [filtered]);

  async function confirmVoid() {
    if (!ctx || !toVoid) return;
    try {
      await voidSale(ctx, toVoid.id);
      toast.success("Sale voided and stock returned.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not void this sale.");
    } finally {
      setToVoid(null);
      setDetail(null);
    }
  }

  return (
    <AppShell
      title="Sales"
      subtitle={`${totals.count} sales · ${formatMoney(totals.revenue, currency)}`}
    >
      <div className="space-y-3">
        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">7 days</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transaction number"
            className="h-12 pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales here"
            description="Sales you make will appear in this list, even offline."
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setDetail(s)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.transaction_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(s.created_at)}
                      {s.cashier_name ? ` · ${s.cashier_name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "tnum font-display text-base font-bold",
                        s.status === "voided" && "text-muted-foreground line-through",
                      )}
                    >
                      {formatMoney(s.total, currency)}
                    </p>
                    {s.status === "voided" ? (
                      <p className="text-xs font-semibold text-destructive">Voided</p>
                    ) : s.sync_status === "pending" ? (
                      <p className="text-xs text-muted-foreground">Not yet synced</p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Receipt</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3">
              <div className="rounded-2xl border p-4 text-sm">
                <p className="text-center font-display font-bold">{store?.name}</p>
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {detail.transaction_number} · {formatDateTime(detail.created_at)}
                </p>
                {(items ?? []).map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">
                      {formatQty(it.quantity)}× {it.product_name_snapshot}
                    </span>
                    <span className="tnum">{formatMoney(it.subtotal, currency)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span className="tnum">{formatMoney(detail.total, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Cash</span>
                  <span className="tnum">{formatMoney(detail.cash_received, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Change</span>
                  <span className="tnum">{formatMoney(detail.change_amount, currency)}</span>
                </div>
                {store?.receipt_footer ? (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {store.receipt_footer}
                  </p>
                ) : null}
              </div>
              {role === "owner" && detail.status === "completed" ? (
                <Button
                  variant="outline"
                  className="h-11 w-full text-destructive"
                  onClick={() => setToVoid(detail)}
                >
                  <Ban className="size-4" /> Void this sale
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toVoid} onOpenChange={(open) => !open && setToVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              The items go back to your stock and the sale is marked voided. This is recorded in your
              activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmVoid()}>Void sale</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
