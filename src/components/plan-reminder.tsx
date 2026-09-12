/**
 * Gentle renewal reminders: 7 days left, 1 day left, and during the grace
 * period after Pro ends. Nothing is blocked — the reminder only informs.
 */
import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

import { useAppSession } from "@/hooks/use-app-session";
import { useIsNativeApp } from "@/hooks/use-native-app";
import { GRACE_DAYS, daysLeft } from "@/lib/plan";

export function PlanReminder() {
  const { store, pro } = useAppSession();
  // In the Android app the reminder only informs — it never invites a payment.
  const nativeApp = useIsNativeApp();
  if (!store?.plan_expires_at) return null;

  const left = daysLeft(store);
  if (left === null) return null;

  const renew = nativeApp ? "on your BentaKo account" : "";
  let message: string | null = null;
  if (pro && left <= 0) {
    message = `Your Pro ended. You have ${GRACE_DAYS} days to renew ${renew} before the free limits come back.`;
  } else if (pro && left === 1) {
    message = `Last day of BentaKo Pro. Renew ${renew} today to keep cloud backup on.`;
  } else if (pro && left <= 7) {
    message = `BentaKo Pro ends in ${left} days. Renew ${renew} anytime — the days are added on top.`;
  } else if (!pro && left > -GRACE_DAYS) {
    message = `Your Pro has lapsed. Renew ${renew} to turn cloud backup and full history back on.`;
  }

  if (!message) return null;
  const text = message.replace(/\s+/g, " ").trim();

  return (
    <Link
      to="/upgrade"
      className="flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
    >
      <Crown className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">{text}</span>
      <span className="shrink-0 font-semibold text-primary">
        {nativeApp ? "Details" : "Renew"}
      </span>
    </Link>
  );
}
