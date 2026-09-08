/**
 * Private BentaKo owner screen: confirm GCash payments and switch shops to Pro.
 * Not linked anywhere in the app; only accounts listed in SUPER_ADMIN_EMAILS
 * can load any of the data behind it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getBillingConfig,
  isBillingAdmin,
  listPlanPayments,
  reviewPlanPayment,
  saveBillingConfig,
  type AdminPayment,
  type BillingConfig,
} from "@/lib/billing.functions";
import { formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bk-admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BentaKo admin — Pro payments" },
      { name: "description", content: "Confirm GCash payments and activate BentaKo Pro." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "BentaKo admin — Pro payments" },
      { property: "og:description", content: "Internal screen for confirming BentaKo Pro payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const checkAdmin = useServerFn(isBillingAdmin);
  const load = useServerFn(listPlanPayments);
  const review = useServerFn(reviewPlanPayment);
  const loadConfig = useServerFn(getBillingConfig);
  const saveConfig = useServerFn(saveBillingConfig);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pending, setPending] = useState<AdminPayment[]>([]);
  const [recent, setRecent] = useState<AdminPayment[]>([]);
  const [config, setConfig] = useState<BillingConfig>({
    gcashName: "",
    gcashNumber: "",
    gcashQrUrl: "",
  });
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await load();
    setPending(result.pending);
    setRecent(result.recent);
  }, [load]);

  useEffect(() => {
    void checkAdmin()
      .then(async (ok) => {
        setAllowed(ok);
        if (!ok) return;
        await refresh();
        setConfig(await loadConfig());
      })
      .catch(() => setAllowed(false));
  }, [checkAdmin, loadConfig, refresh]);

  const decide = async (row: AdminPayment, approve: boolean) => {
    const note = approve ? "" : (window.prompt("Reason (shown to the shop owner)") ?? "");
    if (!approve && note === "") return;
    setBusy(row.id);
    try {
      await review({ data: { id: row.id, approve, note } });
      toast.success(approve ? `${row.store_name ?? "Store"} is now Pro.` : "Marked as not confirmed.");
      await refresh();
    } catch {
      toast.error("Could not save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const monthTotal = recent
    .filter((row) => row.status === "approved" && new Date(row.created_at).getMonth() === new Date().getMonth())
    .reduce((sum, row) => sum + row.amount, 0);

  if (allowed === null) {
    return (
      <AppShell title="Pro payments" subtitle="Checking…">
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-primary" />
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="Not available" subtitle="This screen is for BentaKo staff">
        <p className="text-sm text-muted-foreground">You do not have access to this screen.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Pro payments" subtitle={`${pending.length} waiting to confirm`}>
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">Where shops send the money</h2>
          <div className="space-y-2">
            <Label htmlFor="gname">GCash name</Label>
            <Input
              id="gname"
              className="h-12"
              value={config.gcashName}
              onChange={(e) => setConfig({ ...config, gcashName: e.target.value })}
            />
            <Label htmlFor="gnum">GCash number</Label>
            <Input
              id="gnum"
              className="h-12"
              inputMode="tel"
              value={config.gcashNumber}
              onChange={(e) => setConfig({ ...config, gcashNumber: e.target.value })}
            />
            <Label>GCash QR code</Label>
            {config.gcashQrUrl ? (
              <img
                src={config.gcashQrUrl}
                alt="Your GCash QR code"
                className="mx-auto size-40 rounded-xl border object-contain bg-white"
              />
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                No QR code yet. Shop owners will only see your name and number.
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy("qr");
                try {
                  const dataUrl = await shrinkImage(file);
                  const saved = await saveQr({ data: { dataUrl } });
                  setConfig((c) => ({ ...c, gcashQrUrl: saved.url }));
                  toast.success("QR code saved.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not save that photo.");
                } finally {
                  setBusy(null);
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={busy === "qr"}
                onClick={() => fileRef.current?.click()}
              >
                {busy === "qr" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {config.gcashQrUrl ? "Replace QR photo" : "Upload QR photo"}
              </Button>
              {config.gcashQrUrl ? (
                <Button
                  variant="ghost"
                  className="h-11"
                  disabled={busy === "qr"}
                  onClick={() => {
                    setBusy("qr");
                    void saveQr({ data: { dataUrl: "" } })
                      .then(() => {
                        setConfig((c) => ({ ...c, gcashQrUrl: "" }));
                        toast.success("QR code removed.");
                      })
                      .catch(() => toast.error("Could not remove that."))
                      .finally(() => setBusy(null));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <Button
            className="h-12 w-full"
            disabled={busy === "config"}
            onClick={() => {
              setBusy("config");
              void saveConfig({ data: config })
                .then(() => toast.success("Saved."))
                .catch(() => toast.error("Could not save."))
                .finally(() => setBusy(null));
            }}
          >
            <Save className="size-4" /> Save GCash details
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-bold">Waiting to confirm</h2>
          {pending.length === 0 ? (
            <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              Nothing waiting right now.
            </p>
          ) : (
            pending.map((row) => (
              <article key={row.id} className="space-y-2 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.store_name ?? "Unnamed store"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.requested_by_email ?? "—"} · {row.reference_code}
                    </p>
                  </div>
                  <p className="tnum shrink-0 font-display font-bold">
                    {formatMoney(row.amount, "PHP")}
                  </p>
                </div>
                <p className="text-sm">
                  Ref <span className="tnum font-medium">{row.gcash_reference}</span> ·{" "}
                  {row.plan_period === "yearly" ? "Yearly" : "Monthly"}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p>
                <div className="flex gap-2">
                  <Button
                    className="h-11 flex-1"
                    disabled={busy === row.id}
                    onClick={() => void decide(row, true)}
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    disabled={busy === row.id}
                    onClick={() => void decide(row, false)}
                  >
                    <X className="size-4" /> Reject
                  </Button>
                  {row.proof_url ? (
                    <Button asChild variant="ghost" className="h-11">
                      <a href={row.proof_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="space-y-2 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">
            Approved this month · {formatMoney(monthTotal, "PHP")}
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {row.store_name ?? "Store"} · {row.status}
                  </span>
                  <span className="tnum shrink-0">{formatMoney(row.amount, "PHP")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
