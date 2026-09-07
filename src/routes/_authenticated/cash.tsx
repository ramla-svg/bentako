import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Coins,
  FileText,
  MoreHorizontal,
  Plus,
  Send,
  Smartphone,
} from "lucide-react";
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
import { formatDateTime, formatMoney, localDayKey } from "@/lib/format";
import {
  CASH_PROVIDERS,
  db,
  type CashTxnType,
  type LocalCashTransaction,
  type ServiceProvider,
} from "@/lib/local-db";
import { saveCashTransaction } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cash")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "GCash & E-Wallet — BentaKo" },
      {
        name: "description",
        content: "Track every peso in and out of your drawer, GCash, Maya and bank.",
      },
      { property: "og:title", content: "GCash & E-Wallet — BentaKo" },
      { property: "og:description", content: "Cash in/out, load, bills and more in one list." },
    ],
  }),
  component: CashPage,
});

type RangeKey = "today" | "7d" | "30d";
type FilterKey = "all" | "in" | "out" | "wallet" | "drawer";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in", label: "Cash In" },
  { key: "out", label: "Cash Out" },
  { key: "wallet", label: "GCash/Maya" },
  { key: "drawer", label: "Drawer" },
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

type Preset = {
  key: string;
  label: string;
  icon: typeof ArrowDownLeft;
  tint: string;
  direction: CashTxnType;
  provider: ServiceProvider;
};

const PRESETS: Preset[] = [
  {
    key: "in",
    label: "Cash In",
    icon: ArrowDownLeft,
    tint: "bg-tile-mint text-tile-mint-ink",
    direction: "cash_in",
    provider: "gcash",
  },
  {
    key: "out",
    label: "Cash Out",
    icon: ArrowUpRight,
    tint: "bg-tile-rose text-tile-rose-ink",
    direction: "cash_out",
    provider: "gcash",
  },
  {
    key: "send",
    label: "Send Money",
    icon: Send,
    tint: "bg-tile-sky text-tile-sky-ink",
    direction: "cash_out",
    provider: "gcash",
  },
  {
    key: "load",
    label: "Buy Load",
    icon: Smartphone,
    tint: "bg-tile-lavender text-tile-lavender-ink",
    direction: "cash_out",
    provider: "gcash",
  },
  {
    key: "bills",
    label: "Pay Bills",
    icon: FileText,
    tint: "bg-tile-peach text-tile-peach-ink",
    direction: "cash_out",
    provider: "gcash",
  },
  {
    key: "more",
    label: "More",
    icon: MoreHorizontal,
    tint: "bg-tile-blue text-tile-blue-ink",
    direction: "cash_in",
    provider: "other",
  },
];

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

  const from = rangeStart(range);
  const today = localDayKey();

  const inRange = useMemo(
    () => (entries ?? []).filter((e) => new Date(e.created_at).getTime() >= from),
    [entries, from],
  );

  const wallet = useMemo(() => (entries ?? []).filter((e) => e.provider !== "other"), [entries]);

  const walletBalance =
    wallet
      .filter((e) => e.transaction_type === "cash_in")
      .reduce((s, e) => s + e.amount, 0) -
    wallet.filter((e) => e.transaction_type === "cash_out").reduce((s, e) => s + e.amount, 0);

  const todayEntries = useMemo(
    () => (entries ?? []).filter((e) => localDayKey(e.created_at) === today),
    [entries, today],
  );
  const cashInToday = todayEntries
    .filter((e) => e.transaction_type === "cash_in")
    .reduce((s, e) => s + e.amount, 0);
  const cashOutToday = todayEntries
    .filter((e) => e.transaction_type === "cash_out")
    .reduce((s, e) => s + e.amount, 0);
  const feesToday = todayEntries.reduce((s, e) => s + e.service_fee, 0);

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

  function openNew(preset?: Preset) {
    setDirection(preset?.direction ?? "cash_in");
    setProvider(preset?.provider ?? "other");
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
      back
      title="GCash & E-Wallet"
      subtitle="Cash in/out, load, bills and more"
    >
      <div className="space-y-4">
        {/* Wallet balance */}
        <div className="min-w-0 rounded-3xl bg-wallet p-4 text-wallet-foreground sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-wallet-foreground/20">
              <Smartphone className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold opacity-90">E-Wallet Balance</p>
              <p className="tnum truncate font-display text-fluid-amount font-extrabold">
                {formatMoney(walletBalance, currency)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <WalletStat label="Cash In Today" value={formatMoney(cashInToday, currency)} />
            <WalletStat label="Cash Out Today" value={formatMoney(cashOutToday, currency)} />
            <WalletStat label="Fees Earned" value={formatMoney(feesToday, currency)} />
            <WalletStat label="Transactions" value={String(todayEntries.length)} />
          </div>
        </div>

        {/* Action tiles */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => openNew(p)}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center active:opacity-90",
                p.tint,
              )}
            >
              <p.icon className="size-5" />
              <span className="font-display text-xs font-bold leading-tight">{p.label}</span>
            </button>
          ))}
        </div>

        <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
          </TabsList>
        </Tabs>

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

        <h2 className="font-display text-base font-bold">Recent transactions</h2>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No entries yet"
            description="Record a cash-in, cash-out, load, bill payment or drawer movement."
            action={<Button onClick={() => openNew()}>Add entry</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => {
              const isIn = e.transaction_type === "cash_in";
              const label = CASH_PROVIDERS.find((p) => p.value === e.provider)?.label ?? "Drawer";
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border bg-card p-3"
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full",
                      isIn
                        ? "bg-tile-mint text-tile-mint-ink"
                        : "bg-tile-rose text-tile-rose-ink",
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
                      {isIn ? "Cash In" : "Cash Out"} · {label}
                      {e.customer_name ? ` · ${e.customer_name}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </p>
                    {e.reference_number || e.service_fee > 0 ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {e.reference_number ? `Ref: ${e.reference_number}` : ""}
                        {e.reference_number && e.service_fee > 0 ? " · " : ""}
                        {e.service_fee > 0 ? `Fee: ${formatMoney(e.service_fee, currency)}` : ""}
                      </p>
                    ) : null}
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
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </li>
              );
            })}
          </ul>
        )}

        <Button className="h-14 w-full text-base" onClick={() => openNew()}>
          <Plus className="size-5" /> New e-wallet transaction
        </Button>
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
              <Select value={provider} onValueChange={(v) => setProvider(v as ServiceProvider)}>
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

function WalletStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-wallet-foreground/15 px-2 py-2">
      <p className="truncate opacity-90">{label}</p>
      <p className="tnum truncate font-display text-sm font-bold">{value}</p>
    </div>
  );
}
