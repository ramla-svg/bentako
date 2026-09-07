import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, Plus } from "lucide-react";
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
import { useAppSession } from "@/hooks/use-app-session";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  CASH_PROVIDERS,
  db,
  type CashTxnType,
  type LocalCashTransaction,
  type LocalSale,
  type ServiceProvider,
} from "@/lib/local-db";
import { saveCashTransaction } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cash")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cash ledger — BentaKo" },
      {
        name: "description",
        content: "Track every peso in and out of your drawer, GCash, Maya and bank.",
      },
      { property: "og:title", content: "Cash ledger — BentaKo" },
      { property: "og:description", content: "Drawer and e-wallet movements in one running list." },
    ],
  }),
  component: CashPage,
});

type RangeKey = "today" | "7d" | "30d";
type FilterKey = "all" | "drawer" | "wallet" | "in" | "out";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "drawer", label: "Drawer" },
  { key: "wallet", label: "GCash/Maya" },
  { key: "in", label: "Money in" },
  { key: "out", label: "Money out" },
];

function rangeStart(range: RangeKey): number {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

function CashPage() {
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [range, setRange] = useState<RangeKey>("today");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<CashTxnType>("cash_in");
  const [provider, setProvider] = useState<ServiceProvider>("other");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const entries = useLiveQuery(
    async () =>
      storeId
        ? (await db().cash_transactions.where("store_id").equals(storeId).toArray()).sort((a, b) =>
            b.created_at.localeCompare(a.created_at),
          )
        : [],
    [storeId],
    [] as LocalCashTransaction[],
  );

  const sales = useLiveQuery(
    async () =>
      storeId ? await db().sales.where("store_id").equals(storeId).toArray() : [],
    [storeId],
    [] as LocalSale[],
  );

  const from = rangeStart(range);

  const inRange = useMemo(
    () => (entries ?? []).filter((e) => new Date(e.created_at).getTime() >= from),
    [entries, from],
  );

  const cashFromSales = useMemo(
    () =>
      (sales ?? [])
        .filter(
          (s) =>
            s.status === "completed" &&
            s.payment_method === "cash" &&
            new Date(s.created_at).getTime() >= from,
        )
        .reduce((sum, s) => sum + s.total, 0),
    [sales, from],
  );

  const moneyIn = inRange
    .filter((e) => e.transaction_type === "cash_in")
    .reduce((s, e) => s + e.amount + e.service_fee, 0);
  const moneyOut = inRange
    .filter((e) => e.transaction_type === "cash_out")
    .reduce((s, e) => s + e.amount, 0);
  const runningCash = cashFromSales + moneyIn - moneyOut;

  const filtered = useMemo(
    () =>
      inRange.filter((e) => {
        if (filter === "drawer") return e.provider === "other";
        if (filter === "wallet") return e.provider !== "other";
        if (filter === "in") return e.transaction_type === "cash_in";
        if (filter === "out") return e.transaction_type === "cash_out";
        return true;
      }),
    [inRange, filter],
  );

  function openNew() {
    setDirection("cash_in");
    setProvider("other");
    setAmount("");
    setFee("");
    setCustomerName("");
    setMobile("");
    setReference("");
    setOpen(true);
  }

  async function submit() {
    if (!ctx) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      await saveCashTransaction(ctx, {
        transaction_type: direction,
        provider,
        amount: value,
        service_fee: Number(fee) || 0,
        customer_name: customerName || null,
        customer_mobile_number: mobile || null,
        reference_number: reference || null,
      });
      toast.success("Entry recorded.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save entry.");
    } finally {
      setBusy(false);
    }
  }

  const isWallet = provider !== "other";

  return (
    <AppShell
      title="Cash ledger"
      subtitle={`Cash on hand ${formatMoney(runningCash, currency)}`}
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
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="From sales" value={formatMoney(cashFromSales, currency)} />
          <SummaryCard label="Money in" value={formatMoney(moneyIn, currency)} />
          <SummaryCard label="Money out" value={formatMoney(moneyOut, currency)} />
        </div>

        <div className="scroll-rail -mx-4 flex gap-2 px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium",
                filter === f.key ? "bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No cash entries yet"
            description="Record starting cash, withdrawals, deposits or a GCash cash-in."
            action={<Button onClick={openNew}>Add entry</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => {
              const isIn = e.transaction_type === "cash_in";
              const label =
                CASH_PROVIDERS.find((p) => p.value === e.provider)?.label ?? "Drawer";
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card p-3"
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      isIn ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {isIn ? (
                      <ArrowDownLeft className="size-5" />
                    ) : (
                      <ArrowUpRight className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {label}
                      {e.customer_name ? ` · ${e.customer_name}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                      {e.service_fee > 0 ? ` · fee ${formatMoney(e.service_fee, currency)}` : ""}
                      {e.reference_number ? ` · ${e.reference_number}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tnum shrink-0 font-display text-base font-bold",
                      isIn ? "text-primary" : "text-destructive",
                    )}
                  >
                    {isIn ? "+" : "−"}
                    {formatMoney(e.amount, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Add cash entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Tabs value={direction} onValueChange={(v) => setDirection(v as CashTxnType)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="cash_in">Money in</TabsTrigger>
                <TabsTrigger value="cash_out">Money out</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as ServiceProvider)}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {isWallet ? (
              <>
                <div className="space-y-1.5">
                  <Label>Service fee</Label>
                  <Input
                    value={fee}
                    onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    className="tnum h-12"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Customer name (optional)</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-12"
                  />
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
                  <Label>Reference number (optional)</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="h-12"
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={busy}>
              Save entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="tnum truncate font-display text-base font-bold">{value}</p>
    </div>
  );
}
