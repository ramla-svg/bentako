import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Copy, MoreVertical, Package, Pencil, Plus, Search, Trash2, Undo2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppSession } from "@/hooks/use-app-session";
import { formatMoney, formatQty } from "@/lib/format";
import { UNIT_TYPES, db, type LocalProduct, type UnitType } from "@/lib/local-db";
import {
  archiveProduct,
  duplicateProduct,
  restoreProduct,
  saveCategory,
  saveProduct,
} from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/products")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Products — SariPOS" },
      { name: "description", content: "Manage your product list, prices, and stock levels." },
      { property: "og:title", content: "Products — SariPOS" },
      { property: "og:description", content: "Add and edit sari-sari store products offline." },
    ],
  }),
  component: ProductsPage,
});

interface FormState {
  id?: string;
  name: string;
  category_id: string;
  sku: string;
  barcode: string;
  cost_price: string;
  selling_price: string;
  stock_quantity: string;
  low_stock_threshold: string;
  unit_type: UnitType;
}

function emptyForm(threshold: number): FormState {
  return {
    name: "",
    category_id: "none",
    sku: "",
    barcode: "",
    cost_price: "",
    selling_price: "",
    stock_quantity: "0",
    low_stock_threshold: String(threshold),
    unit_type: "piece",
  };
}

function ProductsPage() {
  const { store, ctx, role } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";
  const canEdit = role === "owner";

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(store?.default_low_stock_threshold ?? 5));
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const products = useLiveQuery(
    async () =>
      storeId
        ? (await db().products.where("store_id").equals(storeId).toArray()).sort((a, b) =>
            a.name.localeCompare(b.name),
          )
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
    return (products ?? []).filter(
      (p) => p.is_active !== showArchived && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, search, showArchived]);

  function openNew() {
    setForm(emptyForm(store?.default_low_stock_threshold ?? 5));
    setOpen(true);
  }

  function openEdit(p: LocalProduct) {
    setForm({
      id: p.id,
      name: p.name,
      category_id: p.category_id ?? "none",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      cost_price: String(p.cost_price),
      selling_price: String(p.selling_price),
      stock_quantity: String(p.stock_quantity),
      low_stock_threshold: String(p.low_stock_threshold),
      unit_type: p.unit_type,
    });
    setOpen(true);
  }

  async function submit() {
    if (!ctx) return;
    if (!form.name.trim()) return toast.error("Product name is required.");
    const selling = Number(form.selling_price);
    if (!selling || selling <= 0) return toast.error("Enter a selling price.");
    setBusy(true);
    try {
      let categoryId: string | null = form.category_id === "none" ? null : form.category_id;
      if (newCategory.trim()) categoryId = await saveCategory(ctx.storeId, newCategory.trim());
      await saveProduct(ctx, {
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        category_id: categoryId,
        sku: form.sku,
        barcode: form.barcode,
        cost_price: Number(form.cost_price) || 0,
        selling_price: selling,
        stock_quantity: Number(form.stock_quantity) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        unit_type: form.unit_type,
      });
      toast.success(form.id ? "Product updated." : "Product added.");
      setNewCategory("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save product.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Products"
      subtitle={`${filtered.length} ${showArchived ? "archived" : "active"}`}
      action={
        canEdit ? (
          <Button size="sm" className="h-10" onClick={openNew}>
            <Plus className="size-4" /> Add
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            className="h-12 pl-9"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-2.5">
          <span className="text-sm">Show archived</span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={showArchived ? "No archived products" : "No products yet"}
            description={
              showArchived
                ? "Archived products will show up here."
                : "Add your first product to start selling."
            }
            action={canEdit ? <Button onClick={openNew}>Add product</Button> : undefined}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => {
              const category = (categories ?? []).find((c) => c.id === p.category_id);
              const low = p.stock_quantity <= p.low_stock_threshold;
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {category?.name ?? "Uncategorized"} · {p.unit_type}
                    </p>
                    <p className="tnum mt-1 text-sm">
                      <span className="font-bold text-primary">
                        {formatMoney(p.selling_price, currency)}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        cost {formatMoney(p.cost_price, currency)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "tnum rounded-full px-2.5 py-1 text-xs font-semibold",
                        p.stock_quantity <= 0
                          ? "bg-destructive/15 text-destructive"
                          : low
                            ? "bg-warning/20 text-accent-foreground"
                            : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {formatQty(p.stock_quantity)}
                    </span>
                    {canEdit ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="size-9">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (ctx) void duplicateProduct(ctx, p.id);
                            }}
                          >
                            <Copy className="size-4" /> Duplicate
                          </DropdownMenuItem>
                          {p.is_active ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (ctx) void archiveProduct(ctx, p.id);
                              }}
                            >
                              <Trash2 className="size-4" /> Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                if (ctx) void restoreProduct(ctx, p.id);
                              }}
                            >
                              <Undo2 className="size-4" /> Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {form.id ? "Edit product" : "Add product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Product name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Coke Mismo"
                className="h-12"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost price">
                <Input
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  inputMode="decimal"
                  className="tnum h-12"
                  placeholder="0"
                />
              </Field>
              <Field label="Selling price">
                <Input
                  value={form.selling_price}
                  onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                  inputMode="decimal"
                  className="tnum h-12"
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock quantity">
                <Input
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  inputMode="decimal"
                  className="tnum h-12"
                />
              </Field>
              <Field label="Low stock alert">
                <Input
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                  inputMode="decimal"
                  className="tnum h-12"
                />
              </Field>
            </div>
            <Field label="Unit">
              <Select
                value={form.unit_type}
                onValueChange={(v) => setForm({ ...form, unit_type: v as UnitType })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={form.category_id}
                onValueChange={(v) => setForm({ ...form, category_id: v })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Or new category">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Frozen"
                className="h-12"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU (optional)">
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="h-12"
                />
              </Field>
              <Field label="Barcode (optional)">
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="h-12"
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={busy}>
              Save product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
