import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { ChevronRight, HandCoins, Plus } from "lucide-react";
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
import { formatMoney } from "@/lib/format";
import {
  db,
  type LocalCustomer,
  type LocalCustomerPayment,
  type LocalSale,
} from "@/lib/local-db";
import { deriveBalance, saveCustomer } from "@/lib/repo";

export const Route = createFileRoute("/_authenticated/utang")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Utang — BentaKo" },
      { name: "description", content: "Know exactly who owes you and how much, any time." },
      { property: "og:title", content: "Utang — BentaKo" },
      { property: "og:description", content: "Customer credit balances, charges and payments." },
    ],
  }),
  component: UtangPage,
});

function UtangPage() {
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

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

  const sales = useLiveQuery(
    async () => (storeId ? await db().sales.where("store_id").equals(storeId).toArray() : []),
    [storeId],
    [] as LocalSale[],
  );

  const ledger = useLiveQuery(
    async () =>
      storeId ? await db().customer_payments.where("store_id").equals(storeId).toArray() : [],
    [storeId],
    [] as LocalCustomerPayment[],
  );

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers ?? []) {
      const charges = (sales ?? []).filter(
        (s) => s.customer_id === c.id && s.payment_method === "utang" && s.status === "completed",
      );
      const rows = (ledger ?? []).filter((l) => l.customer_id === c.id);
      map.set(c.id, deriveBalance(charges, rows));
    }
    return map;
  }, [customers, sales, ledger]);

  const totalOut = useMemo(
    () => [...balances.values()].reduce((s, v) => s + Math.max(0, v), 0),
    [balances],
  );

  async function submit() {
    if (!ctx) return;
    if (!name.trim()) {
      toast.error("Enter the customer's name.");
      return;
    }
    setBusy(true);
    try {
      await saveCustomer(ctx, { name, mobile_number: mobile || null, notes: notes || null });
      toast.success("Customer saved.");
      setName("");
      setMobile("");
      setNotes("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save customer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Utang"
      subtitle={`Total out ${formatMoney(totalOut, currency)}`}
      action={
        <Button size="sm" className="h-10" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Customer
        </Button>
      }
    >
      {(customers ?? []).length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No utang customers yet"
          description="Add a customer so you can charge a sale to their utang at checkout."
          action={<Button onClick={() => setOpen(true)}>Add customer</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {(customers ?? []).map((c) => {
            const balance = balances.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link
                  to="/utang/$customerId"
                  params={{ customerId: c.id }}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border bg-card p-4 active:bg-accent/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.mobile_number ?? "No mobile number"}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-display text-base font-bold">
                    {formatMoney(balance, currency)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile number (optional)</Label>
              <Input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                inputMode="tel"
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
              Save customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
