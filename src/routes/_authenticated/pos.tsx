import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  Minus,
  Plus,
  Printer,
  Search,
  Share2,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppSession } from "@/hooks/use-app-session";
import { useBackHandler } from "@/hooks/use-back-handler";
import { formatMoney, formatQty } from "@/lib/format";
import { db, type LocalProduct } from "@/lib/local-db";
import { printReceiptText } from "@/lib/platform/print-service";
import { shareText } from "@/lib/platform/share-service";
import { buildReceiptText } from "@/lib/receipt";
import { checkout, matchProductByCode, type CartLine, type CheckoutResult } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "New sale — BentaKo" },
      { name: "description", content: "Tap products, take cash, and give change fast." },
      { property: "og:title", content: "New sale — BentaKo" },
      { property: "og:description", content: "The offline sari-sari store checkout screen." },
    ],
  }),
  component: PosPage,
});

function PosPage() {
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const committingRef = useRef(false);

  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeReceipt = useCallback(() => setReceipt(null), []);
  // Android back: close the receipt first, then the cart sheet.
  useBackHandler(receipt !== null, closeReceipt);
  useBackHandler(cartOpen && receipt === null, closeCart);

  const products = useLiveQuery(
    async () =>
      storeId
        ? (await db().products.where("store_id").equals(storeId).toArray())
            .filter((p) => p.is_active)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [storeId],
    [] as LocalProduct[],
  );

  const categories = useLiveQuery(
    async () =>
      storeId
        ? (await db().categories.where("store_id").equals(storeId).toArray()).sort(
            (a, b) => a.sort_order - b.sort_order,
          )
        : [],
    [storeId],
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryId]);

  const lines: CartLine[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const p = (products ?? []).find((x) => x.id === id);
          if (!p) return null;
          const category = (categories ?? []).find((c) => c.id === p.category_id);
          return {
            product_id: p.id,
            name: p.name,
            category_name: category?.name ?? null,
            quantity: qty,
            selling_price: p.selling_price,
            cost_price: p.cost_price,
          } satisfies CartLine;
        })
        .filter((l): l is CartLine => l !== null),
    [cart, products, categories],
  );

  const total = lines.reduce((s, l) => s + l.quantity * l.selling_price, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const cashNumber = Number(cash) || 0;
  const change = cashNumber - total;

  function add(product: LocalProduct) {
    const current = cart[product.id] ?? 0;
    if (!store?.allow_negative_stock && current + 1 > product.stock_quantity) {
      toast.error(`Only ${formatQty(product.stock_quantity)} left of ${product.name}.`);
      return;
    }
    setCart({ ...cart, [product.id]: current + 1 });
  }

  /**
   * Accepts a barcode/SKU string from any source — typed, pasted, or later a
   * native scanner — and adds the matching product to the cart.
   */
  function scanCode(code: string) {
    const product = matchProductByCode(products ?? [], code);
    if (!product) {
      toast.error("No product matches that code.");
      return;
    }
    add(product);
    setSearch("");
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      const next = { ...cart };
      delete next[productId];
      setCart(next);
      return;
    }
    setCart({ ...cart, [productId]: qty });
  }

  async function handleCheckout() {
    if (!ctx || lines.length === 0) return;
    // Guard against a double tap / re-entrant submit creating two sales.
    if (committingRef.current) return;
    if (cashNumber < total) {
      toast.error("Cash received is less than the total.");
      return;
    }
    committingRef.current = true;
    setBusy(true);
    try {
      const result = await checkout(ctx, { lines, cash_received: cashNumber });
      setReceipt(result);
      setCart({});
      setCash("");
      setCartOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      committingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AppShell title="New sale" subtitle={store?.name}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                scanCode(search);
              }
            }}
            placeholder="Search product or scan code"
            className="h-12 pl-9"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>


        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <CategoryChip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
            All
          </CategoryChip>
          {(categories ?? []).map((c) => (
            <CategoryChip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </CategoryChip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBasket}
            title="No products found"
            description="Add products first, or try a different search."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => {
              const inCart = cart[p.id] ?? 0;
              const low = p.stock_quantity <= p.low_stock_threshold;
              return (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className={cn(
                    "relative flex min-h-24 flex-col justify-between rounded-2xl border bg-card p-3 text-left transition active:scale-[0.98]",
                    inCart > 0 && "border-primary ring-1 ring-primary",
                  )}
                >
                  {inCart > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {inCart}
                    </span>
                  ) : null}
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                  <div className="mt-2">
                    <p className="tnum font-display text-base font-bold text-primary">
                      {formatMoney(p.selling_price, currency)}
                    </p>
                    <p
                      className={cn(
                        "tnum text-[11px]",
                        p.stock_quantity <= 0
                          ? "text-destructive"
                          : low
                            ? "text-accent-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {p.stock_quantity <= 0 ? "Out of stock" : `${formatQty(p.stock_quantity)} left`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart bar */}
      {itemCount > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-[4.5rem] z-30 px-4 lg:bottom-4">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-primary px-4 py-3.5 text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBasket className="size-4" />
              {itemCount} item{itemCount > 1 ? "s" : ""}
            </span>
            <span className="tnum font-display text-lg font-bold">
              {formatMoney(total, currency)}
            </span>
          </button>
        </div>
      ) : null}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="px-0">
            <SheetTitle className="font-display">Review sale</SheetTitle>
          </SheetHeader>

          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.product_id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {formatMoney(l.selling_price, currency)} ×{" "}
                    {formatQty(l.quantity)} = {formatMoney(l.selling_price * l.quantity, currency)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-9"
                    onClick={() => setQty(l.product_id, l.quantity - 1)}
                  >
                    {l.quantity === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                  </Button>
                  <span className="tnum w-8 text-center text-sm font-bold">{l.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-9"
                    onClick={() => setQty(l.product_id, l.quantity + 1)}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-secondary p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="tnum font-display text-2xl font-extrabold">
                {formatMoney(total, currency)}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium" htmlFor="cash">
              Cash received
            </label>
            <Input
              id="cash"
              value={cash}
              onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              className="tnum h-14 text-xl font-bold"
            />
            <div className="flex flex-wrap gap-2">
              {[total, 20, 50, 100, 200, 500, 1000].map((amount, i) => (
                <Button
                  key={`${amount}-${i}`}
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 min-w-16"
                  onClick={() => setCash(String(amount))}
                >
                  {i === 0 ? "Exact" : `₱${amount}`}
                </Button>
              ))}
            </div>
            {cashNumber > 0 ? (
              <p
                className={cn(
                  "tnum text-sm font-semibold",
                  change < 0 ? "text-destructive" : "text-primary",
                )}
              >
                {change < 0
                  ? `Short by ${formatMoney(Math.abs(change), currency)}`
                  : `Change: ${formatMoney(change, currency)}`}
              </p>
            ) : null}
          </div>

          <Button
            className="mt-4 h-14 w-full text-base"
            onClick={() => void handleCheckout()}
            disabled={busy || lines.length === 0 || cashNumber < total}
          >
            <Check className="size-5" /> Complete sale
          </Button>
          <Button
            variant="ghost"
            className="mt-2 h-11 w-full text-destructive"
            onClick={() => {
              setCart({});
              setCash("");
              setCartOpen(false);
            }}
          >
            <X className="size-4" /> Clear cart
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Sale completed</DialogTitle>
          </DialogHeader>
          {receipt ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-primary/10 p-4 text-center">
                <p className="text-xs font-medium text-muted-foreground">Change</p>
                <p className="tnum font-display text-4xl font-extrabold text-primary">
                  {formatMoney(receipt.sale.change_amount, currency)}
                </p>
              </div>
              <div className="rounded-2xl border p-4 text-sm">
                <p className="text-center font-display font-bold">{store?.name}</p>
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {receipt.sale.transaction_number}
                </p>
                {receipt.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">
                      {formatQty(it.quantity)}× {it.product_name_snapshot}
                    </span>
                    <span className="tnum">{formatMoney(it.subtotal, currency)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span className="tnum">{formatMoney(receipt.sale.total, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Cash</span>
                  <span className="tnum">{formatMoney(receipt.sale.cash_received, currency)}</span>
                </div>
                {store?.receipt_footer ? (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {store.receipt_footer}
                  </p>
                ) : null}
              </div>
              <Button className="h-12 w-full" onClick={() => setReceipt(null)}>
                New sale
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}
