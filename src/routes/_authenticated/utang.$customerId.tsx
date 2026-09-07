import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { HandCoins, Minus, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  db,
  type LocalCustomer,
  type LocalCustomerPayment,
  type LocalSale,
} from "@/lib/local-db";
import { addManualCharge, deriveBalance, recordCustomerPayment } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/utang/$customerId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Customer utang — BentaKo" },
      { name: "description", content: "Charges and payments for one utang customer." },
      { property: "og:title", content: "Customer utang — BentaKo" },
      { property: "og:description", content: "Record a payment or add a manual charge." },
    ],
  }),
  component: CustomerUtangPage,
});

type Entry = {
  id: string;
  created_at: string;
  label: string;
  amount: number;
  kind: "charge" | "payment";
};

function CustomerUtangPage() {
  const { customerId } = Route.useParams();
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [mode, setMode] = useState<"payment" | "charge" | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const customer = useLiveQuery(
    async () => (customerId ? ((await db().customers.get(customerId)) ?? null) : null),
    [customerId],
    null as LocalCustomer | null,
  );

  const charges = useLiveQuery(
    async () =>
      storeId
        ? (await db().sales.where("store_id").equals(storeId).toArray()).filter(
            (s) =>
              s.customer_id === customerId &&
              s.payment_method === "utang" &&
              s.status === "completed",
          )
        : [],
    [storeId, customerId],
    [] as LocalSale[],
  );

  const ledger = useLiveQuery(
    async () =>
      customerId
        ? await db().customer_payments.where("customer_id").equals(customerId).toArray()
        : [],
    [customerId],
    [] as LocalCustomerPayment[],
  );

  const balance = deriveBalance(charges ?? [], ledger ?? []);

  const entries = useMemo<Entry[]>(() => {
    const rows: Entry[] = [];
    for (const s of charges ?? []) {
      rows.push({
        id: s.id,
        created_at: s.created_at,
        label: `Sale ${s.transaction_number}`,
        amount: s.total,
        kind: "charge",
      });
    }
    for (const l of ledger ?? []) {
      rows.push({
        id: l.id,
        created_at: l.created_at,
        label: l.amount >= 0 ? (l.notes ?? "Payment received") : (l.notes ?? "Manual charge"),
        amount: Math.abs(l.amount),
        kind: l.amount >= 0 ? "payment" : "charge",
      });
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [charges, ledger]);

  async function submit() {
    if (!ctx || !mode || !customerId) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "payment") {
        await recordCustomerPayment(ctx, {
          customer_id: customerId,
          amount: value,
          notes: notes || null,
        });
        toast.success("Payment recorded.");
      } else {
        await addManualCharge(ctx, {
          customer_id: customerId,
          amount: value,
          notes: notes || null,
        });
        toast.success("Charge added.");
      }
      setAmount("");
      setNotes("");
      setMode(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={customer?.name ?? "Customer"}
      subtitle={`Balance ${formatMoney(balance, currency)}${
        customer?.mobile_number ? ` · ${customer.mobile_number}` : ""
      }`}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-12" onClick={() => setMode("payment")}>
            <Minus className="size-4" /> Record payment
          </Button>
          <Button variant="outline" className="h-12" onClick={() => setMode("charge")}>
            <Plus className="size-4" /> Add charge
          </Button>
        </div>

        {customer?.notes ? (
          <p className="rounded-2xl border bg-card p-3 text-sm text-muted-foreground">
            {customer.notes}
          </p>
        ) : null}

        {entries.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No history yet"
            description="Charge a sale to this customer at checkout, or add a charge here."
          />
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.kind === "charge" ? "Charge" : "Payment received"} ·{" "}
                    {formatDateTime(e.created_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "tnum shrink-0 font-display text-base font-bold",
                    e.kind === "charge" ? "text-destructive" : "text-primary",
                  )}
                >
                  {e.kind === "charge" ? "+" : "−"}
                  {formatMoney(e.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {mode === "charge" ? "Add charge" : "Record payment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
