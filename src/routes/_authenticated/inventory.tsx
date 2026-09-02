import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { ArrowDownUp, Boxes, PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { ADJUSTMENT_REASONS, db, type LocalProduct, type MovementType } from "@/lib/local-db";
import { adjustStock, stockIn } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inventory")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inventory — SariPOS" },
      { name: "description", content: "Receive deliveries, fix stock counts, and see stock history." },
      { property: "og:title", content: "Inventory — SariPOS" },
      { property: "og:description", content: "Stock in, adjustments, and movement history." },
    ],
  }),
  component: InventoryPage,
});

const MOVEMENT_LABELS: Record<MovementType, string> = {
  stock_in: "Stock in",
  sale: "Sale",
  adjustment_add: "Correction (add)",
  adjustment_remove: "Correction (remove)",
  damaged: "Damaged",
  expired: "Expired",
  returned: "Returned",
  void_restore: "Void restore",
};

function InventoryPage() {
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [tab, setTab] = useState<"stock" | "history">("stock");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ mode: "in" | "adjust"; product: LocalProduct } | null>(null);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState<MovementType>("adjustment_add");
  const [busy, setBusy] = useState(false);

  const products = useLiveQuery(
    async () =>
      storeId
        ? (await db().products.where("store_id").equals(storeId).toArray())
            .filter((p) => p.is_active)
            .sort((a, b) => a.stock_quantity - b.stock_quantity)
        : [],
    [storeId],
    [] as LocalProduct[],
  );

  const movements = useLiveQuery(
    async () =>
      storeId
        ? (await db().inventory_movements.where("store_id").equals(storeId).toArray())
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 60)
        : [],
    [storeId],
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, search]);

  const totals = useMemo(() => {
    const list = products ?? [];
    return {
      value: list.reduce((s, p) => s + p.cost_price * p.stock_quantity, 0),
      low: list.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold)
        .length,
      out: list.filter((p) => p.stock_quantity <= 0).length,
    };
  }, [products]);

  function openDialog(mode: "in" | "adjust", product: LocalProduct) {
    setDialog({ mode, product });
    setQty("");
    setUnitCost(mode === "in" ? String(product.cost_price) : "");
    setSupplier("");
    setNotes("");
    setReason("adjustment_add");
  }

  async function submit() {
    if (!ctx || !dialog) return;
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) {
      toast.error("Enter a quantity.");
      return;
    }
    setBusy(true);
    try {
      if (dialog.mode === "in") {
        await stockIn(ctx, {
          product_id: dialog.product.id,
          quantity,
          unit_cost: Number(unitCost) || null,
          supplier: supplier || null,
          notes: notes || null,
        });
        toast.success("Stock received.");
      } else {
        const config = ADJUSTMENT_REASONS.find((r) => r.value === reason);
        await adjustStock(ctx, {
          product_id: dialog.product.id,
          movement_type: reason,
          quantity,
          direction: config?.direction ?? "add",
          notes: notes || null,
        });
        toast.success("Stock adjusted.");
      }
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Inventory" subtitle={`Stock value ${formatMoney(totals.value, currency)}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <SummaryTile label="Products" value={String((products ?? []).length)} />
          <SummaryTile label="Low stock" value={String(totals.low)} tone="warning" />
          <SummaryTile label="Out" value={String(totals.out)} tone="danger" />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "stock" | "history")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "stock" ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                className="h-12 pl-9"
              />
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Nothing to show"
                description="Add products first to manage their stock."
              />
            ) : (
              <ul className="space-y-2">
                {filtered.map((p) => {
                  const low = p.stock_quantity <= p.low_stock_threshold;
                  return (
                    <li key={p.id} className="rounded-2xl border bg-card p-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{p.name}</p>
                          <p className="tnum text-xs text-muted-foreground">
                            Alert at {formatQty(p.low_stock_threshold)} · cost{" "}
                            {formatMoney(p.cost_price, currency)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "tnum shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                            p.stock_quantity <= 0
                              ? "bg-destructive/15 text-destructive"
                              : low
                                ? "bg-warning/20 text-accent-foreground"
                                : "bg-secondary text-secondary-foreground",
                          )}
                        >
                          {formatQty(p.stock_quantity)} {p.unit_type}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          className="h-10 flex-1"
                          onClick={() => openDialog("in", p)}
                        >
                          <PackagePlus className="size-4" /> Stock in
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 flex-1"
                          onClick={() => openDialog("adjust", p)}
                        >
                          <ArrowDownUp className="size-4" /> Adjust
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (movements ?? []).length === 0 ? (
          <EmptyState
            icon={ArrowDownUp}
            title="No stock movements yet"
            description="Deliveries, sales, and corrections will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {(movements ?? []).map((m) => {
              const product = (products ?? []).find((p) => p.id === m.product_id);
              const positive = m.new_stock >= m.previous_stock;
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product?.name ?? "Product"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {MOVEMENT_LABELS[m.movement_type]} · {formatDateTime(m.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "tnum text-sm font-bold",
                        positive ? "text-primary" : "text-destructive",
                      )}
                    >
                      {positive ? "+" : "-"}
                      {formatQty(m.quantity)}
                    </p>
                    <p className="tnum text-xs text-muted-foreground">→ {formatQty(m.new_stock)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {dialog?.mode === "in" ? "Receive stock" : "Adjust stock"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dialog?.product.name} · now {formatQty(dialog?.product.stock_quantity ?? 0)}
            </p>
            {dialog?.mode === "adjust" ? (
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as MovementType)}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="tnum h-14 text-xl font-bold"
                placeholder="0"
              />
            </div>
            {dialog?.mode === "in" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Unit cost</Label>
                  <Input
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    className="tnum h-12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Supplier (optional)</Label>
                  <Input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="h-12"
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3",
        tone === "warning" && "border-warning/50 bg-warning/10",
        tone === "danger" && "border-destructive/40 bg-destructive/10",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum font-display text-xl font-bold">{value}</p>
    </div>
  );
}
