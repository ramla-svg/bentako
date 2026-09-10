import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAppSession } from "@/hooks/use-app-session";
import { useBackHandler } from "@/hooks/use-back-handler";
import { formatMoney, formatQty } from "@/lib/format";
import {
  PAYMENT_METHODS,
  db,
  type LocalCustomer,
  type LocalProduct,
  type PaymentMethod,
} from "@/lib/local-db";
import { printReceipt } from "@/lib/platform/print-service";
import { shareText } from "@/lib/platform/share-service";
import { buildReceiptPrintDoc, buildReceiptText } from "@/lib/receipt";
import { useStoreLogo } from "@/lib/store-logo";
import {
  checkout,
  matchProductByCode,
  saveCustomer,
  type CartLine,
  type CheckoutResult,
} from "@/lib/repo";
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
  const logoUrl = useStoreLogo(store?.logo_url);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [cash, setCash] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [newCustomer, setNewCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const committingRef = useRef(false);
  const cartRestored = useRef(false);

  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeReceipt = useCallback(() => setReceipt(null), []);
  // Android back: close the receipt first, then the cart sheet.
  useBackHandler(receipt !== null, closeReceipt);
  useBackHandler(cartOpen && receipt === null, closeCart);

  // Lifecycle safety: Android may suspend or kill the app mid-sale, so the
  // in-progress cart is mirrored to local storage and restored on relaunch.
  const draftKey = storeId ? `bentako.cart-draft.${storeId}` : "";
  useEffect(() => {
    if (!draftKey || cartRestored.current) return;
    cartRestored.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { cart?: Record<string, number>; cash?: string };
      if (draft.cart && Object.keys(draft.cart).length > 0) setCart(draft.cart);
      if (typeof draft.cash === "string") setCash(draft.cash);
    } catch {
      /* a bad draft must never block the POS */
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !cartRestored.current) return;
    // Deferred so the storage write never blocks the tap or the cart opening.
    const write = () => {
      try {
        if (Object.keys(cart).length === 0) window.localStorage.removeItem(draftKey);
        else window.localStorage.setItem(draftKey, JSON.stringify({ cart, cash }));
      } catch {
        /* storage full / blocked — the sale still works */
      }
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const id = ric ? ric(write) : window.setTimeout(write, 200);
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback;
      if (ric && cic) cic(id);
      else window.clearTimeout(id);
    };
  }, [cart, cash, draftKey]);

  const customers = useLiveQuery(
    async () =>
      storeId
        ? (await db().customers.where("store_id").equals(storeId).toArray())
            .filter((c) => c.is_active)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [storeId],
    [] as LocalCustomer[],
  );

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

  const allowNegative = store?.allow_negative_stock ?? false;
  // Stable identity so memoized product tiles do not re-render on every tap.
  const add = useCallback(
    (product: LocalProduct) => {
      setCart((prev) => {
        const current = prev[product.id] ?? 0;
        if (!allowNegative && current + 1 > product.stock_quantity) {
          toast.error(`Only ${formatQty(product.stock_quantity)} left of ${product.name}.`);
          return prev;
        }
        return { ...prev, [product.id]: current + 1 };
      });
    },
    [allowNegative],
  );

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
    if (method === "cash" && cashNumber < total) {
      toast.error("Cash received is less than the total.");
      return;
    }
    if (method === "utang" && !customerId) {
      toast.error("Choose a customer for this utang.");
      return;
    }
    committingRef.current = true;
    setBusy(true);
    try {
      const result = await checkout(ctx, {
        lines,
        cash_received: method === "cash" ? cashNumber : 0,
        payment_method: method,
        customer_id: method === "utang" ? customerId : null,
      });
      setReceipt(result);
      setCart({});
      setCash("");
      setMethod("cash");
      setCustomerId("");
      setCartOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      committingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AppShell back title="New sale" subtitle={store?.name}>
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


        <div className="scroll-rail -mx-4 flex gap-2 px-4 pb-1 sm:-mx-6 sm:px-6">
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
            {filtered.map((p) => (
              <ProductTile
                key={p.id}
                product={p}
                inCart={cart[p.id] ?? 0}
                currency={currency}
                onAdd={add}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        {itemCount > 0 ? (
          <div className="safe-nav-offset app-gutter fixed inset-x-0 z-30">
            <SheetTrigger asChild>
              <Button
                type="button"
                className="mx-auto flex h-auto w-full max-w-md items-center justify-between rounded-2xl px-4 py-3.5 shadow-lg shadow-primary/30 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ShoppingBasket className="size-4" />
                  {itemCount} item{itemCount > 1 ? "s" : ""}
                </span>
                <span className="tnum font-display text-2xl font-extrabold">
                  {formatMoney(total, currency)}
                </span>
              </Button>
            </SheetTrigger>
          </div>
        ) : null}

        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="px-0">
            <SheetTitle className="font-display">Review sale</SheetTitle>
          </SheetHeader>

          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.product_id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{l.name}</p>
                  <p className="tnum text-sm font-medium text-muted-foreground">
                    {formatMoney(l.selling_price, currency)} × {formatQty(l.quantity)} ={" "}
                    <span className="font-bold text-foreground">
                      {formatMoney(l.selling_price * l.quantity, currency)}
                    </span>
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
              <span className="text-base font-bold">Total</span>
              <span className="tnum font-display text-3xl font-extrabold">
                {formatMoney(total, currency)}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Payment</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-sm font-medium",
                    method === m.value ? "bg-primary text-primary-foreground" : "bg-card",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {method === "utang" ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Customer</p>
              {(customers ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(customers ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCustomerId(c.id)}
                      className={cn(
                        "rounded-full border px-3.5 py-2 text-sm font-medium",
                        customerId === c.id ? "bg-primary text-primary-foreground" : "bg-card",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={newCustomer}
                  onChange={(e) => setNewCustomer(e.target.value)}
                  placeholder="New customer name"
                  className="h-12"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 shrink-0"
                  onClick={async () => {
                    if (!ctx || !newCustomer.trim()) return;
                    try {
                      const created = await saveCustomer(ctx, { name: newCustomer });
                      setCustomerId(created.id);
                      setNewCustomer("");
                      toast.success("Customer added.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not add customer.");
                    }
                  }}
                >
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Nothing is received now — this amount is added to their utang.
              </p>
            </div>
          ) : null}

          {method === "cash" ? (
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
          ) : null}

          <Button
            className="mt-4 h-14 w-full text-base"
            onClick={() => void handleCheckout()}
            disabled={
              busy ||
              lines.length === 0 ||
              (method === "cash" && cashNumber < total) ||
              (method === "utang" && !customerId)
            }
          >
            <Check className="size-5" /> Complete sale
          </Button>
          <Button
            variant="ghost"
            className="mt-2 h-11 w-full text-destructive"
            onClick={() => {
              setCart({});
              setCash("");
              setMethod("cash");
              setCustomerId("");
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
                <p className="text-xs font-medium text-muted-foreground">
                  {receipt.sale.payment_method === "utang" ? "Unpaid — utang" : "Change"}
                </p>
                <p className="tnum font-display text-4xl font-extrabold text-primary">
                  {formatMoney(
                    receipt.sale.payment_method === "utang"
                      ? receipt.sale.total
                      : receipt.sale.change_amount,
                    currency,
                  )}
                </p>
              </div>
              <div className="rounded-2xl border p-4 text-base">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${store?.name ?? "Store"} logo`}
                    className="mx-auto mb-2 max-h-16 w-auto object-contain"
                  />
                ) : null}
                <p className="text-center font-display text-lg font-bold">{store?.name}</p>
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {receipt.sale.transaction_number}
                </p>
                {receipt.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 py-1">
                    <span className="truncate">
                      {formatQty(it.quantity)}× {it.product_name_snapshot}
                    </span>
                    <span className="tnum font-semibold">{formatMoney(it.subtotal, currency)}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span className="tnum text-2xl">{formatMoney(receipt.sale.total, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {receipt.sale.payment_method === "cash"
                      ? "Cash"
                      : receipt.sale.payment_method === "utang"
                        ? "Utang"
                        : "Paid"}
                  </span>
                  <span className="tnum">
                    {receipt.sale.payment_method === "cash"
                      ? formatMoney(receipt.sale.cash_received, currency)
                      : receipt.sale.payment_method === "utang"
                        ? "Unpaid"
                        : formatMoney(receipt.sale.total, currency)}
                  </span>
                </div>
                {store?.receipt_footer ? (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {store.receipt_footer}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    const ok = printReceipt(
                      buildReceiptPrintDoc(receipt, store, logoUrl),
                      receipt.sale.transaction_number,
                    );
                    if (!ok)
                      toast.error(
                        "This device cannot print. Use Share to send the receipt instead.",
                      );
                  }}
                >
                  <Printer className="size-4" /> Print
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={async () => {
                    const result = await shareText({
                      title: `Receipt ${receipt.sale.transaction_number}`,
                      text: buildReceiptText(receipt, store),
                    });
                    if (result === "copied") toast.success("Receipt copied.");
                    if (result === "unavailable") toast.error("Sharing is not available here.");
                  }}
                >
                  <Share2 className="size-4" /> Share
                </Button>
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

/** Memoized so tapping one product does not re-render the whole grid. */
const ProductTile = memo(function ProductTile({
  product,
  inCart,
  currency,
  onAdd,
}: {
  product: LocalProduct;
  inCart: number;
  currency: string;
  onAdd: (product: LocalProduct) => void;
}) {
  const low = product.stock_quantity <= product.low_stock_threshold;
  return (
    <button
      onClick={() => onAdd(product)}
      className={cn(
        "relative flex min-h-24 flex-col justify-between rounded-2xl border bg-card p-3 text-left",
        inCart > 0 && "border-primary ring-1 ring-primary",
      )}
    >
      {inCart > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {inCart}
        </span>
      ) : null}
      <p className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</p>
      <div className="mt-2">
        <p className="tnum font-display text-2xl font-extrabold leading-tight text-primary">
          {formatMoney(product.selling_price, currency)}
        </p>
        <p
          className={cn(
            "tnum text-xs font-medium",
            product.stock_quantity <= 0
              ? "text-destructive"
              : low
                ? "text-accent-foreground"
                : "text-muted-foreground",
          )}
        >
          {product.stock_quantity <= 0
            ? "Out of stock"
            : `${formatQty(product.stock_quantity)} left`}
        </p>
      </div>
    </button>
  );
});

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
