import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, Calculator } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/hooks/use-app-session";
import { fromCents, toCents, type DrawerEvent } from "@/lib/cash-drawer";
import { formatDateTime, formatMoney } from "@/lib/format";
import { uuid } from "@/lib/ids";
import { loadDrawer, recordCashCount, recordDrawerMovement } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cash-on-hand")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Cash on hand — BentaKo" },
      {
        name: "description",
        content: "Expected cash in the drawer from your last count, with every cash in and out.",
      },
      { property: "og:title", content: "Cash on hand — BentaKo" },
      {
        property: "og:description",
        content: "Count your drawer, then see cash sales, expenses and withdrawals add up.",
      },
    ],
  }),
  component: CashOnHandPage,
});

type Mode = "count" | "add" | "withdraw";

const MODE_TEXT: Record<Mode, { title: string; hint: string; button: string }> = {
  count: {
    title: "Count cash now",
    hint: "Count the bills and coins physically in the drawer right now. From this moment, BentaKo adds and subtracts cash from here. Earlier sales are not added on top.",
    button: "Save count",
  },
  add: {
    title: "Add cash to drawer",
    hint: "Your own money or change fund put into the drawer. Not counted as sales.",
    button: "Add cash",
  },
  withdraw: {
    title: "Take cash out",
    hint: "Owner withdrawal, deposit to bank, or cash moved elsewhere. Not counted as an expense.",
    button: "Take out",
  },
};

function CashOnHandPage() {
  const { store, ctx } = useAppSession();
  const storeId = store?.id ?? "";
  const currency = store?.currency ?? "PHP";
  const [mode, setMode] = useState<Mode | null>(null);
  const [entryId, setEntryId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const drawer = useLiveQuery(() => (storeId ? loadDrawer(storeId) : undefined), [storeId]);
  const money = (cents: number) => formatMoney(fromCents(cents), currency);

  function open(next: Mode) {
    setMode(next);
    setEntryId(uuid()); // one id per dialog: repeated taps save once
    setAmount("");
    setNotes("");
  }

  const value = Number(amount);
  const valid =
    amount.trim() !== "" && Number.isFinite(value) && (mode === "count" ? value >= 0 : value > 0);
  const current = drawer?.expectedCents ?? 0;
  const preview =
    !valid || !mode
      ? null
      : mode === "count"
        ? toCents(value)
        : current + (mode === "add" ? toCents(value) : -toCents(value));

  async function submit() {
    if (!ctx || !mode || !valid || busy) return;
    setBusy(true);
    try {
      if (mode === "count") await recordCashCount(ctx, { id: entryId, counted: value, notes });
      else
        await recordDrawerMovement(ctx, {
          id: entryId,
          direction: mode === "add" ? "add" : "withdraw",
          amount: value,
          notes,
        });
      toast.success("Saved on this device.");
      setMode(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const ex = drawer?.excluded;
  const excludedTotal = ex ? ex.unclassifiedExpenses + ex.unknownRepayments + ex.legacyService : 0;
  const events = [...(drawer?.events ?? [])].reverse();

  return (
    <AppShell back title="Cash on hand" subtitle="Physical cash in the drawer">
      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
        <div className="space-y-3">
          <div className="fin-hero p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
              Expected cash on hand
            </p>
            {drawer?.hasBaseline ? (
              <>
                <p className="tnum font-display text-3xl font-extrabold sm:text-4xl">
                  {money(drawer.expectedCents)}
                </p>
                <p className="mt-1 text-xs opacity-90">
                  Last counted {money(drawer.lastCount!.cents)} ·{" "}
                  {formatDateTime(drawer.lastCount!.at)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-primary-foreground/15 p-2">
                    <p className="opacity-80">Cash in since count</p>
                    <p className="tnum font-display text-base font-bold">{money(drawer.inCents)}</p>
                  </div>
                  <div className="rounded-xl bg-primary-foreground/15 p-2">
                    <p className="opacity-80">Cash out since count</p>
                    <p className="tnum font-display text-base font-bold">
                      {money(drawer.outCents)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-1 text-base font-semibold">Not set yet — count your drawer first.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button className="h-14 flex-col gap-0.5 text-sm" onClick={() => open("count")}>
              <Calculator className="size-5" /> Count
            </Button>
            <Button
              variant="outline"
              className="h-14 flex-col gap-0.5 text-sm"
              disabled={!drawer?.hasBaseline}
              onClick={() => open("add")}
            >
              <ArrowDownLeft className="size-5" /> Add cash
            </Button>
            <Button
              variant="outline"
              className="h-14 flex-col gap-0.5 text-sm"
              disabled={!drawer?.hasBaseline}
              onClick={() => open("withdraw")}
            >
              <ArrowUpRight className="size-5" /> Take out
            </Button>
          </div>

          <div className="fin-card space-y-1.5 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">What is counted</p>
            <p>
              Added: cash sales (cash received minus change), utang payments received in cash, cash
              you add, and GCash/e-wallet entries where you confirmed drawer cash moved.
            </p>
            <p>
              Subtracted: expenses paid from the cash drawer and cash you take out. Not included:
              utang sales, GCash/Maya/bank sales and repayments, and expenses paid outside the
              drawer.
            </p>
            <p>
              This is an expected amount, not profit. Recount any time to correct it. It uses
              records on this device; entries from other phones appear after they sync.
            </p>
          </div>

          {excludedTotal > 0 || (drawer?.unclassifiedExpenseIds.length ?? 0) > 0 ? (
            <div className="fin-card flex gap-2 border-accent/50 p-3 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-accent" />
              <div className="space-y-1">
                <p className="font-semibold">Some records are not in this total</p>
                {ex?.unclassifiedExpenses ? (
                  <p>{ex.unclassifiedExpenses} expense(s) since your count have no “paid from”.</p>
                ) : null}
                {ex?.unknownRepayments ? (
                  <p>{ex.unknownRepayments} utang payment(s) since your count have no method.</p>
                ) : null}
                {ex?.legacyService ? (
                  <p>
                    {ex.legacyService} GCash entry(ies) since your count have no drawer cash info.
                  </p>
                ) : null}
                {drawer?.unclassifiedExpenseIds.length ? (
                  <p>
                    {drawer.unclassifiedExpenseIds.length} older expense(s) are unclassified.{" "}
                    <Link to="/expenses" className="font-semibold text-primary underline">
                      Classify in Expenses
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <section className="space-y-2">
          <h2 className="font-display text-base font-bold">Cash history</h2>
          {events.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No cash history yet"
              description="Count your drawer to start. Cash sales and expenses then show up here."
              action={<Button onClick={() => open("count")}>Count cash now</Button>}
            />
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <HistoryRow key={e.id} e={e} money={money} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && !busy && setMode(null)}>
        <DialogContent className="max-w-md">
          {mode ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{MODE_TEXT[mode].title}</DialogTitle>
                <DialogDescription>{MODE_TEXT[mode].hint}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="drawer-amount">
                    {mode === "count" ? "Cash counted" : "Amount"}
                  </Label>
                  <Input
                    id="drawer-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    className="tnum h-14 text-xl font-bold"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="drawer-notes">Note (optional)</Label>
                  <Input
                    id="drawer-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-12"
                  />
                </div>
                {preview !== null ? (
                  <p className="rounded-xl bg-muted p-3 text-sm">
                    {mode === "count" && drawer?.hasBaseline ? (
                      <>
                        Expected was {money(current)}. Difference{" "}
                        <b className="tnum">{money(preview - current)}</b>.{" "}
                      </>
                    ) : null}
                    Cash on hand becomes <b className="tnum">{money(preview)}</b>
                    {preview < 0 ? " — more than the drawer holds." : "."}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  className="h-12 w-full text-base"
                  disabled={!valid || busy}
                  onClick={() => void submit()}
                >
                  {MODE_TEXT[mode].button}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function HistoryRow({ e, money }: { e: DrawerEvent; money: (c: number) => string }) {
  const isCount = e.source === "count";
  const positive = e.cents >= 0;
  return (
    <li className="fin-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">
          {e.label}
          {e.notes ? <span className="font-normal text-muted-foreground"> · {e.notes}</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDateTime(e.at)} · {money(e.beforeCents)} → {money(e.afterCents)}
        </p>
        {isCount && e.differenceCents !== undefined && e.differenceCents !== 0 ? (
          <p className="text-xs font-semibold text-destructive">
            {e.differenceCents < 0 ? "Short" : "Over"} {money(Math.abs(e.differenceCents))} vs
            expected
          </p>
        ) : null}
      </div>
      <span
        className={cn(
          "tnum shrink-0 font-display text-base font-bold",
          isCount ? "" : positive ? "text-primary" : "text-destructive",
        )}
      >
        {isCount ? money(e.cents) : `${positive ? "+" : "−"}${money(Math.abs(e.cents))}`}
      </span>
    </li>
  );
}
