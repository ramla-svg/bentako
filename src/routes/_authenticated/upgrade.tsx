import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Crown, Minus, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GcashPaySheet } from "@/components/gcash-pay-sheet";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { useIsNativeApp } from "@/hooks/use-native-app";
import { formatDateTime } from "@/lib/format";
import { PRO_PRICE_MONTHLY, PRO_PRICE_YEARLY, daysLeft } from "@/lib/plan";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/upgrade")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BentaKo Pro — Plans and pricing" },
      {
        name: "description",
        content:
          "Compare the free BentaKo plan with BentaKo Pro at ₱99 a month: cloud backup, unlimited products, extra phones and cashier accounts.",
      },
      { property: "og:title", content: "BentaKo Pro — Plans and pricing" },
      {
        property: "og:description",
        content: "Free forever on one phone, or ₱99 a month to back up your records and grow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UpgradePage,
});

interface Row {
  label: string;
  free: string | boolean;
  pro: string | boolean;
}

const ROWS: Row[] = [
  { label: "Products", free: "60", pro: "Walang limit" },
  { label: "Phones", free: "1", pro: "3" },
  { label: "Cashier accounts", free: false, pro: "2" },
  { label: "Cloud backup & restore", free: false, pro: true },
  { label: "Report history", free: "7 days", pro: "Buong history" },
  { label: "Export to spreadsheet", free: false, pro: true },
  { label: "Your logo on receipts", free: false, pro: true },
  { label: "Offline POS & receipts", free: true, pro: true },
  { label: "Cash & utang ledger", free: true, pro: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-primary" />;
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/60" />;
  return <span className="tnum text-xs font-semibold">{value}</span>;
}

function UpgradePage() {
  const { store, plan, pro } = useAppSession();
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [open, setOpen] = useState(false);
  const left = daysLeft(store);
  // Inside the Android app we only show what Pro includes and the current
  // status. Buying happens on the BentaKo website, never in the app.
  const nativeApp = useIsNativeApp();

  return (
    <AppShell
      title="BentaKo Pro"
      subtitle={pro ? "Your plan is active" : "Protect your records. Grow the shop."}
    >
      <div className="space-y-4">
        {pro ? (
          <section className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
            <p className="flex items-center gap-2 font-display text-sm font-bold">
              <Crown className="size-4 text-primary" /> BentaKo Pro is active
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {store?.plan_expires_at
                ? `Renews on ${formatDateTime(store.plan_expires_at)}${
                    left !== null && left >= 0 ? ` · ${left} day${left === 1 ? "" : "s"} left` : ""
                  }`
                : "Everything is unlocked on this store."}
            </p>
          </section>
        ) : nativeApp ? (
          <section className="rounded-2xl border bg-card p-4">
            <p className="font-display text-sm font-bold">Your plan: Free</p>
            <p className="mt-1 text-sm text-muted-foreground">
              BentaKo Pro is ₱{PRO_PRICE_MONTHLY} a month or ₱{PRO_PRICE_YEARLY} a year and is
              managed on your BentaKo account. Open bentako.lovable.app in your browser and sign in
              with the same account to change your plan. Once it is active, it unlocks here
              automatically.
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPeriod("monthly")}
              className={cn(
                "rounded-2xl border p-4 text-left",
                period === "monthly" ? "border-primary bg-primary/10" : "bg-card",
              )}
            >
              <p className="text-xs font-semibold uppercase text-muted-foreground">Monthly</p>
              <p className="tnum font-display text-xl font-bold">₱{PRO_PRICE_MONTHLY}</p>
              <p className="text-xs text-muted-foreground">per month</p>
            </button>
            <button
              type="button"
              onClick={() => setPeriod("yearly")}
              className={cn(
                "relative rounded-2xl border p-4 text-left",
                period === "yearly" ? "border-primary bg-primary/10" : "bg-card",
              )}
            >
              <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                SAVE 2 MOS
              </span>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Yearly</p>
              <p className="tnum font-display text-xl font-bold">₱{PRO_PRICE_YEARLY}</p>
              <p className="text-xs text-muted-foreground">per year</p>
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b bg-secondary/40 text-xs">
                <th className="w-[46%] p-3 text-left font-semibold">What you get</th>
                <th className="p-3 text-center font-semibold">
                  Free
                  {plan === "free" ? (
                    <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                      your plan
                    </span>
                  ) : null}
                </th>
                <th className="p-3 text-center font-semibold text-primary">
                  Pro
                  {pro ? (
                    <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                      your plan
                    </span>
                  ) : null}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="p-3 text-sm">{row.label}</td>
                  <td className="p-3 text-center">
                    <Cell value={row.free} />
                  </td>
                  <td className="bg-primary/5 p-3 text-center">
                    <Cell value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {!pro && !nativeApp ? (
          <>
            <Button className="h-14 w-full text-base" onClick={() => setOpen(true)}>
              <Sparkles className="size-4" />
              {period === "monthly"
                ? `Upgrade — ₱${PRO_PRICE_MONTHLY} / month`
                : `Upgrade — ₱${PRO_PRICE_YEARLY} / year`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Cancel anytime. Your sales, products and utang stay on your phone even if you stop
              paying.
            </p>
          </>
        ) : null}

        <section className="space-y-2 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">Why Pro costs money</h2>
          <p className="text-sm text-muted-foreground">
            Selling, receipts, cash and utang all run on your phone, so the free plan is free
            forever. Pro pays for keeping a safe copy of your records outside the phone, so you can
            change or lose a phone and get everything back — and for letting your helpers use their
            own sign-in.
          </p>
        </section>
      </div>

      {nativeApp ? null : <GcashPaySheet open={open} onOpenChange={setOpen} period={period} />}

    </AppShell>
  );
}
