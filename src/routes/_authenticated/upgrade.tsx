import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Crown, Minus, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GcashPaySheet } from "@/components/gcash-pay-sheet";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { useIsNativeApp } from "@/hooks/use-native-app";
import { formatDateTime } from "@/lib/format";
import {
  ANNUAL_SAVING,
  PLAN_COMPARISON,
  PLAN_SUMMARY,
  LOCAL_DATA_NOTE,
  SYNC_DATA_NOTE,
  PRINT_NOTE,
  PRO_PRICE_MONTHLY,
  PRO_PRICE_YEARLY,
  daysLeft,
} from "@/lib/plan";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/upgrade")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BentaKo Pro — Plans and pricing" },
      {
        name: "description",
        content:
          "Compare the free BentaKo plan with BentaKo Pro at ₱99 a month: cloud backup, unlimited products, extra devices and up to 30-day reports.",
      },
      { property: "og:title", content: "BentaKo Pro — Plans and pricing" },
      {
        property: "og:description",
        content: "Free forever on one phone, or ₱99 a month to sync eligible records and grow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UpgradePage,
});

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
      back
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
                ? `Expires on ${formatDateTime(store.plan_expires_at)}${
                    left !== null && left >= 0 ? ` · ${left} day${left === 1 ? "" : "s"} left` : ""
                  }`
                : "Available Pro benefits are active on this store."}
            </p>
          </section>
        ) : nativeApp ? (
          <section className="fin-card p-4">
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
            <Button
              variant="outline"
              type="button"
              onClick={() => setPeriod("monthly")}
              className={cn(
                "h-auto flex-col items-start rounded-lg border p-4 text-left gap-0",
                period === "monthly" ? "border-primary bg-primary/10 text-foreground" : "bg-card text-foreground",
              )}
            >
              <p className="text-xs font-semibold uppercase text-muted-foreground">Monthly</p>
              <p className="tnum font-display text-xl font-bold">₱{PRO_PRICE_MONTHLY}</p>
              <p className="text-xs text-muted-foreground">per month</p>
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => setPeriod("yearly")}
              className={cn(
                "h-auto flex-col items-start rounded-lg border p-4 text-left gap-0",
                period === "yearly" ? "border-primary bg-primary/10 text-foreground" : "bg-card text-foreground",
              )}
            >
              <span className="mb-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                Save ₱{ANNUAL_SAVING} · ~16%
              </span>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Yearly</p>
              <p className="tnum font-display text-xl font-bold">₱{PRO_PRICE_YEARLY}</p>
              <p className="text-xs text-muted-foreground">per year</p>
            </Button>
          </div>
        )}

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{PLAN_SUMMARY[plan]}</p>
          <p>{LOCAL_DATA_NOTE}</p>
          <p>
            Payments has its own up-to-30-day summary on both plans, separate from Reports and the
            GCash log.
          </p>
          <p>
            Manual billing expires on the stated date, with the existing 14-day grace period. No
            automatic renewal.
          </p>
          <p>{PRINT_NOTE}</p>
        </div>

        <section className="overflow-hidden fin-card">
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
              {PLAN_COMPARISON.map((row) =>
                row.soon ? (
                  <tr key={row.label} className="border-b bg-accent/20 last:border-0">
                    <td className="p-3 text-sm">
                      <span className="block">{row.label}</span>
                      <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
                        Coming soon
                      </span>
                    </td>
                    <td colSpan={2} className="p-3 text-center">
                      <span className="text-xs font-semibold text-accent-foreground">
                        Not available yet
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="p-3 text-sm">{row.label}</td>
                    <td className="p-3 text-center">
                      <Cell value={row.free} />
                    </td>
                    <td className="bg-primary/5 p-3 text-center">
                      <Cell value={row.pro} />
                    </td>
                  </tr>
                ),
              )}
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
              Manual payment; no automatic renewal. Your local records remain if Pro expires.
            </p>
          </>
        ) : null}

        <section className="space-y-2 fin-card p-4">
          <h2 className="font-display text-sm font-bold">Why Pro costs money</h2>
          <p className="text-sm text-muted-foreground">
            {SYNC_DATA_NOTE} A replacement device can restore successfully synced eligible records,
            not device-only photos or activity logs.
          </p>
        </section>
      </div>

      {nativeApp ? null : <GcashPaySheet open={open} onOpenChange={setOpen} period={period} />}
    </AppShell>
  );
}
