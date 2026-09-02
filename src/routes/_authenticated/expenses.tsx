import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
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
import { formatDate, formatMoney, localDayKey } from "@/lib/format";
import { EXPENSE_CATEGORIES, db, type LocalExpense } from "@/lib/local-db";
import { archiveExpense, saveExpense } from "@/lib/repo";

export const Route = createFileRoute("/_authenticated/expenses")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Expenses — SariPOS" },
      { name: "description", content: "Record store expenses so your profit numbers stay honest." },
      { property: "og:title", content: "Expenses — SariPOS" },
      { property: "og:description", content: "Track deliveries, kuryente, and other daily costs." },
    ],
  }),
  component: ExpensesPage,
});

type RangeKey = "today" | "month" | "all";

function ExpensesPage() {
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [range, setRange] = useState<RangeKey>("today");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LocalExpense | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]!);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDayKey());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const expenses = useLiveQuery(
    async () =>
      storeId
        ? (await db().expenses.where("store_id").equals(storeId).toArray())
            .filter((e) => e.is_active)
            .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
        : [],
    [storeId],
    [] as LocalExpense[],
  );

  const filtered = useMemo(() => {
    const today = localDayKey();
    const month = today.slice(0, 7);
    return (expenses ?? []).filter((e) => {
      if (range === "today") return e.expense_date === today;
      if (range === "month") return e.expense_date.startsWith(month);
      return true;
    });
  }, [expenses, range]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  function openNew() {
    setEditing(null);
    setTitle("");
    setCategory(EXPENSE_CATEGORIES[0]!);
    setAmount("");
    setDate(localDayKey());
    setNotes("");
    setOpen(true);
  }

  function openEdit(e: LocalExpense) {
    setEditing(e);
    setTitle(e.title);
    setCategory(e.category);
    setAmount(String(e.amount));
    setDate(e.expense_date);
    setNotes(e.notes ?? "");
    setOpen(true);
  }

  async function submit() {
    if (!ctx) return;
    const value = Number(amount);
    if (!title.trim()) {
      toast.error("What is this expense for?");
      return;
    }
    if (!value || value <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      await saveExpense(ctx, {
        ...(editing ? { id: editing.id } : {}),
        title,
        category,
        amount: value,
        notes: notes || null,
        expense_date: date,
      });
      toast.success(editing ? "Expense updated." : "Expense recorded.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save expense.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Expenses"
      subtitle={formatMoney(total, currency)}
      action={
        <Button size="sm" className="h-10" onClick={openNew}>
          <Plus className="size-4" /> Add
        </Button>
      }
    >
      <div className="space-y-3">
        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No expenses recorded"
            description="Add deliveries, kuryente, or transport costs to see real profit."
            action={<Button onClick={openNew}>Add expense</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.category} · {formatDate(e.expense_date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="tnum font-display text-base font-bold">
                    {formatMoney(e.amount, currency)}
                  </span>
                  <Button size="icon" variant="ghost" className="size-9" onClick={() => openEdit(e)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-destructive"
                    onClick={() => {
                      if (ctx) void archiveExpense(ctx, e.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? "Edit expense" : "Add expense"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>What is it for?</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Delivery from supplier"
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="tnum h-14 text-xl font-bold"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={busy}>
              Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
