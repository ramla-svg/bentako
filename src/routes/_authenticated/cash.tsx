import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Coins,
  Download,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  Send,
  Share2,
  Smartphone,
  Trash2,
  Wallet,
  X,
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
import { downloadBlob, downscaleImage, sharePhoto } from "@/lib/image-file";
import {
  CASH_PROVIDERS,
  db,
  type CashTxnType,
  type LocalCashTransaction,
  type ServiceProvider,
} from "@/lib/local-db";
import {
  deleteCashPhoto,
  getCashPhoto,
  putCashPhoto,
  saveCashTransaction,
  saveWalletAdjustment,
} from "@/lib/repo";
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
type FilterKey = "all" | "in" | "out";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in", label: "Cash In" },
  { key: "out", label: "Cash Out" },
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
    key: "load",
    label: "Buy Load",
    icon: Smartphone,
    tint: "bg-tile-lavender text-tile-lavender-ink",
    direction: "cash_out",
  },
  {
    key: "bills",
    label: "Pay Bills",
    icon: FileText,
    tint: "bg-tile-peach text-tile-peach-ink",
    direction: "cash_out",
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

  // Screenshot attached to the entry being created (kept on this device only).
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Balance-by-hand dialog
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceMode, setBalanceMode] = useState<"set" | "delta">("set");
  const [balanceValue, setBalanceValue] = useState("");
  const [balanceSign, setBalanceSign] = useState<"add" | "remove">("add");

  // Full-screen photo viewer
  const [viewer, setViewer] = useState<{ id: string; url: string; blob: Blob } | null>(null);

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

  const photoIds = useLiveQuery(
    async () =>
      storeId
        ? new Set(
            (await db().cash_photos.where("store_id").equals(storeId).toArray()).map(
              (p) => p.cash_transaction_id,
            ),
          )
        : new Set<string>(),
    [storeId],
    new Set<string>(),
  );

  const from = rangeStart(range);
  const today = localDayKey();

  const inRange = useMemo(
    () => (entries ?? []).filter((e) => new Date(e.created_at).getTime() >= from),
    [entries, from],
  );

  const wallet = useMemo(() => (entries ?? []).filter((e) => e.provider !== "other"), [entries]);

  const walletTotal =
    wallet.filter((e) => e.transaction_type === "cash_in").reduce((s, e) => s + e.amount, 0) -
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

  // Object URLs must be released or the WebView slowly leaks memory.
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function openNew(preset?: Preset) {
    setDirection(preset?.direction ?? "cash_in");
    setProvider(preset?.provider ?? "other");
    setAmount("");
    setFee("");
    setCustomerName("");
    setMobile("");
    setReference("");
    setPhoto(null);
    setOpen(true);
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file.");
      return;
    }
    const small = await downscaleImage(file);
    setPhoto(small);
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
        photo,
      });
      toast.success(photo ? "Entry and photo saved on this phone." : "Entry recorded.");
      setPhoto(null);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save entry.");
    } finally {
      setBusy(false);
    }
  }

  function openBalance(mode: "set" | "delta") {
    setBalanceMode(mode);
    setBalanceSign("add");
    setBalanceValue(mode === "set" ? String(Math.max(0, Number(walletTotal.toFixed(2)))) : "");
    setBalanceOpen(true);
  }

  async function submitBalance() {
    if (!ctx) return;
    const value = Number(balanceValue);
    if (!Number.isFinite(value) || (balanceMode === "delta" && value <= 0)) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      const signed = balanceMode === "delta" && balanceSign === "remove" ? -value : value;
      const row = await saveWalletAdjustment(ctx, { mode: balanceMode, amount: signed });
      toast.success(row ? "E-wallet balance updated." : "Balance already matches.");
      setBalanceOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update balance.");
    } finally {
      setBusy(false);
    }
  }

  async function openViewer(id: string) {
    const row = await getCashPhoto(id);
    if (!row) {
      toast.error("Photo is no longer on this phone.");
      return;
    }
    setViewer({ id, url: URL.createObjectURL(row.blob), blob: row.blob });
  }

  function closeViewer() {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  }

  async function attachToExisting(id: string, file: File | undefined) {
    if (!file || !storeId) return;
    const small = await downscaleImage(file);
    await putCashPhoto(storeId, id, small);
    toast.success("Photo attached on this phone.");
  }

  const isWallet = provider !== "other";

  return (
    <AppShell back title="GCash & E-Wallet" subtitle="Cash in/out, load, bills and more">
      <div className="space-y-4">
        {/* Wallet balance */}
        <div className="min-w-0 rounded-3xl bg-wallet p-4 text-wallet-foreground sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-wallet-foreground/20">
              <Smartphone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold opacity-90">E-Wallet Balance</p>
              <p className="tnum truncate font-display text-fluid-amount font-extrabold">
                {formatMoney(walletTotal, currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBalance("set")}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-wallet-foreground/20 px-3 py-2 text-xs font-bold"
            >
              <Wallet className="size-4" /> Balance
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <WalletStat label="Cash In Today" value={formatMoney(cashInToday, currency)} />
            <WalletStat label="Cash Out Today" value={formatMoney(cashOutToday, currency)} />
            <WalletStat label="Fees Earned" value={formatMoney(feesToday, currency)} />
            <WalletStat label="Transactions" value={String(todayEntries.length)} />
          </div>
          {walletTotal === 0 ? (
            <p className="mt-3 text-[11px] opacity-90">
              New here? Tap Balance and type what your GCash app really shows.
            </p>
          ) : null}
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

        <div className="scroll-rail -mx-4 flex gap-2 px-4 pb-1 sm:-mx-6 sm:px-6">
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
              const hasPhoto = photoIds?.has(e.id) ?? false;
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border bg-card p-3"
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full",
                      isIn ? "bg-tile-mint text-tile-mint-ink" : "bg-tile-rose text-tile-rose-ink",
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
                    <PhotoRowAction
                      hasPhoto={hasPhoto}
                      onView={() => void openViewer(e.id)}
                      onPick={(file) => void attachToExisting(e.id, file)}
                    />
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

        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-14 w-full text-base" onClick={() => openNew()}>
            <Plus className="size-5" /> New e-wallet transaction
          </Button>
          <Button
            variant="outline"
            className="h-14 w-full text-base"
            onClick={() => openBalance("delta")}
          >
            <Wallet className="size-5" /> Top up / correct balance
          </Button>
        </div>
      </div>

      {/* Add entry */}
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

            {/* Screenshot of the GCash transaction */}
            <div className="space-y-1.5">
              <Label>Transaction photo (optional)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(ev) => void pickPhoto(ev.target.files?.[0])}
              />
              {photoUrl ? (
                <div className="flex items-center gap-3 rounded-2xl border p-2">
                  <img
                    src={photoUrl}
                    alt="Attached transaction photo"
                    className="size-16 shrink-0 rounded-xl object-cover"
                  />
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    Kept on this phone only.
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove photo"
                    onClick={() => setPhoto(null)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="size-4" /> Take or pick screenshot
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Photos stay in BentaKo on this phone — never uploaded, so no cloud storage cost.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={busy}>
              Save entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance by hand */}
      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">E-wallet balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Tabs value={balanceMode} onValueChange={(v) => setBalanceMode(v as "set" | "delta")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="set">Set balance</TabsTrigger>
                <TabsTrigger value="delta">Top up / correct</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              {balanceMode === "set"
                ? `BentaKo now shows ${formatMoney(walletTotal, currency)}. Type what your GCash app really shows and the difference is recorded as one correction entry.`
                : "Add money you loaded into your wallet, or take out an amount to fix a mistake."}
            </p>
            {balanceMode === "delta" ? (
              <Tabs value={balanceSign} onValueChange={(v) => setBalanceSign(v as "add" | "remove")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="add">Add</TabsTrigger>
                  <TabsTrigger value="remove">Take out</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            <div className="space-y-1.5">
              <Label>{balanceMode === "set" ? "Real balance" : "Amount"}</Label>
              <Input
                value={balanceValue}
                onChange={(e) => setBalanceValue(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="tnum h-14 text-xl font-bold"
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="h-12 w-full text-base"
              onClick={() => void submitBalance()}
              disabled={busy}
            >
              Save balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo viewer */}
      <Dialog open={!!viewer} onOpenChange={(o) => (o ? null : closeViewer())}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Transaction photo</DialogTitle>
          </DialogHeader>
          {viewer ? (
            <div className="space-y-3">
              <img
                src={viewer.url}
                alt="Transaction photo"
                className="max-h-[60vh] w-full rounded-2xl object-contain"
              />
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    void (async () => {
                      const shared = await sharePhoto(viewer.blob, "bentako-transaction.jpg");
                      if (!shared) toast.message("Sharing is not available here — use Save.");
                    })();
                  }}
                >
                  <Share2 className="size-4" /> Share
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => downloadBlob(viewer.blob, "bentako-transaction.jpg")}
                >
                  <Download className="size-4" /> Save
                </Button>
                <Button
                  variant="outline"
                  className="h-12 text-destructive"
                  onClick={() => {
                    void (async () => {
                      await deleteCashPhoto(viewer.id);
                      closeViewer();
                      toast.success("Photo removed from this phone.");
                    })();
                  }}
                >
                  <X className="size-4" /> Remove
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Save or share to keep a copy in your Gallery or Drive — photos live on this phone
                only.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function PhotoRowAction({
  hasPhoto,
  onView,
  onPick,
}: {
  hasPhoto: boolean;
  onView: () => void;
  onPick: (file: File | undefined) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-1">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(ev) => onPick(ev.target.files?.[0])}
      />
      <button
        type="button"
        onClick={hasPhoto ? onView : () => ref.current?.click()}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium text-muted-foreground"
      >
        {hasPhoto ? (
          <>
            <ImageIcon className="size-3" /> View photo
          </>
        ) : (
          <>
            <Camera className="size-3" /> Add photo
          </>
        )}
      </button>
    </div>
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
