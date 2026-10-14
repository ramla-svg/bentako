/** Owner tools: subscriber analytics and per-store Pro removal (super admin only). */
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { canSubmitRevoke, type AdminMetrics } from "@/lib/admin-subscriptions";
import {
  getAdminMetrics,
  listAdminStores,
  revokeStoreProPlan,
  type AdminStoreListItem,
} from "@/lib/billing.functions";
import { formatDate, formatMoney } from "@/lib/format";

const peso = (cents: number) => formatMoney(cents / 100, "PHP");
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export function AdminOverview({ version }: { version: number }) {
  const load = useServerFn(getAdminMetrics);
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    void load()
      .then(setM)
      .catch(() => setError(true));
  }, [load, version]);

  if (error)
    return (
      <p className="fin-card p-4 text-sm text-destructive">Could not load figures. Try again.</p>
    );
  if (!m) return <Loader2 className="mx-auto mt-6 size-6 animate-spin text-primary" />;
  const max = Math.max(1, ...m.trend.map((t) => t.cents));
  const stat = (label: string, value: string | number) => (
    <div className="fin-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum font-display text-xl font-bold">{value}</p>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stat("Total stores", m.totalStores)}
        {stat("Active Pro", m.activePro)}
        {stat("Free", m.freeStores)}
        {stat("Expired Pro", m.expiredPro)}
        {stat("Active monthly", m.activeMonthly)}
        {stat("Active yearly", m.activeYearly)}
        {stat("Pending payments", m.pendingPayments)}
        {stat("Approved payments", m.approvedCount)}
      </div>
      <section className="space-y-3 fin-card p-4">
        <h2 className="font-display text-sm font-bold">Approved subscription revenue</h2>
        <p className="text-xs text-muted-foreground">
          GCash Pro payments you approved, by approval date (Philippine time). Not profit and not
          shop sales — costs and refunds are not tracked. Monthly and yearly payments are counted
          when paid, not spread per month.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {stat("All time", peso(m.approvedTotalCents))}
          {stat(`This month (${monthLabel(m.currentMonth)})`, peso(m.currentMonthCents))}
          {stat("Last month", peso(m.previousMonthCents))}
        </div>
        {m.approvedCount === 0 ? (
          <p className="text-sm text-muted-foreground">No approved payments yet.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Last 6 months">
            {m.trend.map((t) => (
              <li
                key={t.month}
                className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs"
              >
                <span>{monthLabel(t.month)}</span>
                <span className="h-3 rounded bg-muted">
                  <span
                    className="block h-3 rounded bg-primary"
                    style={{ width: `${(t.cents / max) * 100}%` }}
                  />
                </span>
                <span className="tnum">{peso(t.cents)}</span>
              </li>
            ))}
          </ul>
        )}
        {m.fallbackDatedCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {m.fallbackDatedCount} older approved payment(s) have no approval time and are dated by
            when they were sent (historical fallback).
          </p>
        ) : null}
      </section>
    </div>
  );
}

const STATUS_LABEL = {
  free: "Free",
  pro_active: "Active Pro",
  pro_expired: "Expired Pro",
} as const;

export function AdminStores({ version, onChanged }: { version: number; onChanged: () => void }) {
  const list = useServerFn(listAdminStores);
  const revoke = useServerFn(revokeStoreProPlan);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<{
    items: AdminStoreListItem[];
    total: number;
    pageSize: number;
  } | null>(null);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<AdminStoreListItem | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setError(false);
    void list({ data: { q, status, page } })
      .then(setRes)
      .catch(() => setError(true));
  }, [list, q, status, page]);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh, version]);

  const submit = async () => {
    if (!target || !canSubmitRevoke(reason, busy)) return;
    setBusy(true);
    try {
      const r = await revoke({
        data: { storeId: target.id, reason, expectedExpiresAt: target.plan_expires_at },
      });
      if (r.status === "revoked") toast.success(`${target.name} is now on Free.`);
      else if (r.status === "already_free") toast.message("That store was already on Free.");
      else if (r.status === "stale")
        toast.error("This store's plan changed. The list was refreshed — check again.");
      else toast.error("Store not found.");
      setTarget(null);
      setReason("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove Pro.");
    } finally {
      setBusy(false);
    }
  };

  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search stores"
            className="h-11 pl-9"
            placeholder="Store, owner, email or store ID"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label="Filter by plan"
          className="h-11 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All plans</option>
          <option value="pro_active">Active Pro</option>
          <option value="pro_expired">Expired Pro</option>
          <option value="free">Free</option>
        </select>
      </div>

      {error ? (
        <p className="fin-card p-4 text-sm text-destructive">Could not load stores.</p>
      ) : !res ? (
        <Loader2 className="mx-auto mt-6 size-6 animate-spin text-primary" />
      ) : res.items.length === 0 ? (
        <p className="fin-card p-4 text-sm text-muted-foreground">No stores match.</p>
      ) : (
        <ul className="space-y-2">
          {res.items.map((s) => (
            <li key={s.id} className="fin-card space-y-1 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{s.name}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {s.owner_name ?? "No owner name"}
                    {s.owner_email ? ` · ${s.owner_email}` : ""}
                  </p>
                  <p className="break-all text-[11px] text-muted-foreground">ID {s.id}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              {s.plan === "pro" ? (
                <p className="text-xs">
                  {s.plan_period === "yearly"
                    ? "Yearly"
                    : s.plan_period === "monthly"
                      ? "Monthly"
                      : "—"}{" "}
                  · {s.plan_expires_at ? `ends ${formatDate(s.plan_expires_at)}` : "no end date"}
                </p>
              ) : null}
              {s.plan === "pro" ? (
                <Button variant="outline" className="h-10" onClick={() => setTarget(s)}>
                  Remove Pro plan / Alisin ang Pro
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {res && res.total > res.pageSize ? (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page + 1} of {pages} · {res.total} stores
          </span>
          <Button variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setTarget(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Pro from this store?</DialogTitle>
            <DialogDescription>
              Only <strong>{target?.name}</strong> (
              {target?.owner_email ?? target?.owner_name ?? "owner"}, ID {target?.id}) changes. It
              goes to Free right away. Its sales, stock, utang and customer records and its payment
              history stay. No refund is made automatically. Offline phones switch to Free the next
              time they go online.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (required)</Label>
            <Textarea
              id="revoke-reason"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canSubmitRevoke(reason, busy)}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Remove Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
