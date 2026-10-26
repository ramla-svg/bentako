import { Link, createFileRoute } from "@tanstack/react-router";
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
  Plus,
  Share2,
  Smartphone,
  Trash2,
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
import { CASH_PROVIDERS, db, type LocalCashTransaction } from "@/lib/local-db";
import {
  CASH_SERVICE_LABELS,
  physicalCashEffect,
  recordedWalletBalance,
  serviceKindOf,
  suggestedPhysicalCash,
  walletDirection,
  type CashServiceKind,
  type PhysicalCashMove,
} from "@/lib/cash-flow";
import { deleteCashPhoto, getCashPhoto, putCashPhoto, saveCashTransaction } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cash")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "GCash & E-Wallet — BentaKo" },
      {
        name: "description",
        content:
          "Record GCash customer services with separate e-wallet and physical cash movements.",
      },
      { property: "og:title", content: "GCash & E-Wallet — BentaKo" },
      { property: "og:description", content: "Cash in/out, load, bills and more in one list." },
    ],
  }),
  component: CashPage,
});

type RangeKey = "today" | "7d" | "30d";
type FilterKey = "all" | "in" | "out";

/** What kind of entry this is. `add_balance` is a wallet top-up by the store. */
type EntryKind = CashServiceKind;

const KINDS: { value: EntryKind; label: string; hint: string }[] = [
  {
    value: "cash_in",
    label: "Cash In",
    hint: "You send GCash to the customer — your GCash balance decreases",
  },
  {
    value: "cash_out",
    label: "Cash Out",
    hint: "You receive GCash from the customer — your GCash balance increases",
  },
  { value: "add_balance", label: "Add Balance", hint: "You top up your own e-wallet" },
  {
    value: "buy_load",
    label: "Buy Load",
    hint: "You buy load for the customer — your GCash balance decreases",
  },
  {
    value: "pay_bills",
    label: "Pay Bills",
    hint: "You pay the customer's bill — your GCash balance decreases",
  },
];

const NOTE_SOURCES = ["Bank", "GCash app", "Cash on hand", "Load / Bills", "Other"] as const;
type NoteSource = (typeof NOTE_SOURCES)[number] | "";

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

type DrawerMove = PhysicalCashMove;

/** Physical cash movement is decided by the service kind and funding source. */
function defaultDrawerMove(kind: EntryKind, source: NoteSource): DrawerMove {
  return suggestedPhysicalCash(kind, source);
}

type Preset = {
  key: string;
  label: string;
  icon: typeof ArrowDownLeft;
  tint: string;
  kind: EntryKind;
  source?: NoteSource;
};

const PRESETS: Preset[] = [
  {
    key: "in",
    label: "Cash In",
    icon: ArrowDownLeft,
    tint: "bg-tile-mint text-tile-mint-ink",
    kind: "cash_in",
  },
  {
    key: "out",
    label: "Cash Out",
    icon: ArrowUpRight,
    tint: "bg-tile-rose text-tile-rose-ink",
    kind: "cash_out",
  },
  {
    key: "load",
    label: "Buy Load",
    icon: Smartphone,
    tint: "bg-tile-lavender text-tile-lavender-ink",
    kind: "buy_load",
    source: "Load / Bills",
  },
  {
    key: "bills",
    label: "Pay Bills",
    icon: FileText,
    tint: "bg-tile-peach text-tile-peach-ink",
    kind: "pay_bills",
    source: "Load / Bills",
  },
];

function CashPage() {
  const { store, ctx, pro } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";

  const [range, setRange] = useState<RangeKey>("today");
  // The free plan sees the last 7 days of wallet entries; Pro offers up to 30 days. Older entries remain local.
  const effectiveRange: RangeKey = !pro && range === "30d" ? "7d" : range;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind>("cash_in");
  const [source, setSource] = useState<NoteSource>("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  // Explicit physical drawer effect for Cash on hand (never inferred from notes).
  const drawerMove = defaultDrawerMove(kind, source);
  const [feeInCash, setFeeInCash] = useState(true);

  // Screenshot attached to the entry being created (kept on this device only).
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const from = rangeStart(effectiveRange);
  const today = localDayKey();

  const inRange = useMemo(
    () =>
      (entries ?? []).filter(
        (e) => e.status !== "voided" && new Date(e.created_at).getTime() >= from,
      ),
    [entries, from],
  );

  const wallet = useMemo(() => (entries ?? []).filter((e) => e.provider !== "other"), [entries]);

  const walletTotal = recordedWalletBalance(wallet, storeId);
  const hasLegacyWalletEntries = wallet.some((e) => e.status !== "voided" && !e.service_kind);
  const previewAmount = Number(amount);
  const previewFee = Number(fee);
  const walletChange = walletDirection(kind) === "cash_in" ? previewAmount : -previewAmount;
  const physicalChange = physicalCashEffect(
    drawerMove,
    previewAmount,
    feeInCash ? previewFee : 0,
  );
  const showPreview =
    Number.isFinite(previewAmount) && previewAmount > 0 && Number.isFinite(previewFee);

  const todayEntries = useMemo(
    () =>
      (entries ?? []).filter((e) => e.status !== "voided" && localDayKey(e.created_at) === today),
    [entries, today],
  );
  const cashInToday = todayEntries
    .filter((e) => serviceKindOf(e) === "cash_in")
    .reduce((s, e) => s + e.amount, 0);
  const cashOutToday = todayEntries
    .filter((e) => serviceKindOf(e) === "cash_out")
    .reduce((s, e) => s + e.amount, 0);
  const feesToday = todayEntries.reduce((s, e) => s + e.service_fee, 0);

  const filtered = useMemo(
    () =>
      inRange.filter((e) => {
        if (filter === "in") return serviceKindOf(e) === "cash_in";
        if (filter === "out") return serviceKindOf(e) === "cash_out";
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
    setKind(preset?.kind ?? "cash_in");
    setSource(preset?.source ?? "");
    setNote("");
    setAmount("");
    setFee("");
    setCustomerName("");
    setMobile("");
    setReference("");
    setPhoto(null);
    setFeeInCash(true);
    setOpen(true);
  }

  /** "Add balance · Bank — extra detail", trimmed of empty parts. */
  function composeNote(): string | null {
    const parts: string[] = [];
    if (kind === "add_balance") parts.push("Add balance");
    if (source && source !== "Other") parts.push(source);
    else if (source === "Other") parts.push("Other");
    const head = parts.join(" · ");
    const tail = note.trim();
    return [head, tail].filter(Boolean).join(" — ") || null;
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || !pro) return;
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
    if (busy) return;
    const feeValue = Number(fee) || 0;
    const drawerEffect = physicalCashEffect(drawerMove, value, feeInCash ? feeValue : 0);
    setBusy(true);
    try {
      await saveCashTransaction(ctx, {
        drawer_effect: drawerEffect,
        transaction_type: walletDirection(kind),
        service_kind: kind,
        notes: composeNote(),
        provider: "gcash",
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
    if (!file || !ctx || !pro) return;
    try {
      const small = await downscaleImage(file);
      await putCashPhoto(ctx, id, small);
      toast.success("Photo attached on this phone.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach photo.");
    }
  }

  return (
    <AppShell back title="GCash & E-Wallet" subtitle="Cash in/out, load, bills and more">
      <div className="space-y-4">
        {/* Wallet balance */}
        <div className="min-w-0 rounded-3xl bg-primary p-4 text-primary-foreground sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-foreground/20">
              <Smartphone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold opacity-90">Recorded E-Wallet Balance</p>
              <p className="tnum truncate font-display text-fluid-amount font-extrabold">
                {formatMoney(walletTotal, currency)}
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

        {hasLegacyWalletEntries ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Older entries keep their original amounts and directions. Past Cash In/Out entries may
            have used the opposite GCash direction, so this recorded balance may differ from your
            GCash app.
          </p>
        ) : null}

        {/* Action tiles */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => openNew(p)}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 fin-card px-1 text-center active:opacity-90"
              >
                <span
                  className={cn("grid size-10 shrink-0 place-items-center rounded-full", p.tint)}
                >
                  <Icon className="size-5" />
                </span>
                <span className="font-display text-xs font-bold leading-tight text-foreground">
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>

        <Tabs
          value={effectiveRange}
          onValueChange={(v) => {
            if (!pro && v === "30d") return;
            setRange(v as RangeKey);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days{pro ? "" : " · Pro"}</TabsTrigger>
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
            description="Record a cash-in, cash-out, load or bill payment."
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
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 fin-card p-3"
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
                      {CASH_SERVICE_LABELS[serviceKindOf(e)]} · {label}
                      {e.customer_name ? ` · ${e.customer_name}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </p>
                    {e.notes ? (
                      <p className="truncate text-xs text-muted-foreground">{e.notes}</p>
                    ) : null}
                    <p className="truncate text-xs text-muted-foreground">
                      {e.drawer_effect == null
                        ? "Physical cash: not recorded"
                        : e.drawer_effect === 0
                          ? "Physical cash: no change"
                          : `Physical cash: ${e.drawer_effect > 0 ? "+" : "−"}${formatMoney(Math.abs(e.drawer_effect), currency)}`}
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
                      canAdd={pro}
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
                    <span className="block text-right text-[10px] font-medium text-muted-foreground">
                      E-wallet
                    </span>
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
          <Plus className="size-5" /> New GCash transaction
        </Button>
      </div>

      {/* Add entry */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Add cash entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type of entry</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as EntryKind);
                }}
              >
                <SelectTrigger className="h-12 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {KINDS.find((k) => k.value === kind)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Where from / what for (optional)</Label>
              <Select
                value={source || "none"}
                onValueChange={(v) => {
                  const next = v === "none" ? "" : (v as NoteSource);
                  setSource(next);
                }}
              >
                <SelectTrigger className="h-12 w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {NOTE_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-12"
                placeholder="Note (e.g. from BDO, for Meralco bill)"
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
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={!feeInCash}
                  onChange={(e) => setFeeInCash(!e.target.checked)}
                />
                Fee was deducted from GCash instead
              </label>
              <p className="text-[11px] text-muted-foreground">
                Cash on hand updates automatically: Cash In, Buy Load and Pay Bills add cash; Cash
                Out gives cash; Add Balance takes cash only when funded from Cash on hand.
              </p>
              {showPreview ? (
                <dl className="grid gap-1 text-sm" aria-label="Transaction cash effects">
                  <div className="flex justify-between gap-2">
                    <dt>GCash change</dt>
                    <dd className="tnum font-semibold">
                      {walletChange >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(walletChange), currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Physical cash change</dt>
                    <dd className="tnum font-semibold">
                      {physicalChange >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(physicalChange), currency)}
                    </dd>
                  </div>
                </dl>
              ) : null}
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

            {/* Screenshot of the GCash transaction (Pro) */}
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
              {!pro ? (
                <Link
                  to="/upgrade"
                  className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 text-sm"
                >
                  <Camera className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    Keep a GCash screenshot with each entry on Pro.
                  </span>
                  <span className="shrink-0 font-semibold text-primary">See Pro</span>
                </Link>
              ) : photoUrl ? (
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
              {pro ? (
                <p className="text-[11px] text-muted-foreground">
                  Photos stay in BentaKo on this phone — never uploaded, so no cloud storage cost.
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={busy}>
              Save entry
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
  canAdd,
  onView,
  onPick,
}: {
  hasPhoto: boolean;
  canAdd: boolean;
  onView: () => void;
  onPick: (file: File | undefined) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  if (!hasPhoto && !canAdd) return null;
  return (
    <div className="mt-1">
      {canAdd ? (
        <input
          ref={ref}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(ev) => onPick(ev.target.files?.[0])}
        />
      ) : null}
      <Button
        variant="outline"
        type="button"
        onClick={hasPhoto ? onView : () => ref.current?.click()}
        className="h-auto gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground"
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
      </Button>
    </div>
  );
}

function WalletStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-primary-foreground/15 px-2 py-2">
      <p className="truncate opacity-90">{label}</p>
      <p className="tnum truncate font-display text-sm font-bold">{value}</p>
    </div>
  );
}
