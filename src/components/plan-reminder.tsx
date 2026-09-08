/**
 * Gentle renewal reminders: 7 days left, 1 day left, and during the grace
 * period after Pro ends. Nothing is blocked — the reminder only informs.
 */
import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

import { useAppSession } from "@/hooks/use-app-session";
import { GRACE_DAYS, daysLeft } from "@/lib/plan";

export function PlanReminder() {
  const { store, pro } = useAppSession();
  if (!store?.plan_expires_at) return null;

  const left = daysLeft(store);
  if (left === null) return null;

  let message: string | null = null;
  if (pro && left <= 0) {
    message = `Your Pro ended. You have ${GRACE_DAYS} days to renew before the free limits come back.`;
  } else if (pro && left === 1) {
    message = "Last day of BentaKo Pro. Renew today to keep cloud backup on.";
  } else if (pro && left <= 7) {
    message = `BentaKo Pro ends in ${left} days. Renew anytime — the days are added on top.`;
  } else if (!pro && left > -GRACE_DAYS) {
    message = "Your Pro has lapsed. Renew to turn cloud backup and full history back on.";
  }

  if (!message) return null;

  return (
    <Link
      to="/upgrade"
      className="flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
    >
      <Crown className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">{message}</span>
      <span className="shrink-0 font-semibold text-primary">Renew</span>
    </Link>
  );
}
