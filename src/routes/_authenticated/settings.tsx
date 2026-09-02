import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { LogOut, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useConnection } from "@/components/connection-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { runIntegrityCheck, type IntegrityIssue } from "@/lib/integrity";
import { getSetting } from "@/lib/local-db";
import { seedDemoProducts } from "@/lib/repo";
import { isOnline, syncNow } from "@/lib/sync-service";


export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Settings — BentaKo" },
      { name: "description", content: "Store details, receipt footer, sync, and account options." },
      { property: "og:title", content: "Settings — BentaKo" },
      { property: "og:description", content: "Manage your BentaKo store preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { store, ctx, role, email, refresh, signOut } = useAppSession();
  const navigate = useNavigate();
  const isOwner = role === "owner";

  const [name, setName] = useState(store?.name ?? "");
  const [ownerName, setOwnerName] = useState(store?.owner_name ?? "");
  const [footer, setFooter] = useState(store?.receipt_footer ?? "");
  const [threshold, setThreshold] = useState(String(store?.default_low_stock_threshold ?? 5));
  const [negative, setNegative] = useState(store?.allow_negative_stock ?? false);
  const [confirmVoid, setConfirmVoid] = useState(store?.confirm_void ?? true);
  const [busy, setBusy] = useState(false);

  const [issues, setIssues] = useState<IntegrityIssue[] | null>(null);
  const { connection, pending, failed, lastIssue } = useConnection();
  const online = connection !== "offline" && isOnline();
  const lastSyncAt = useLiveQuery(async () => await getSetting<string | null>("last_sync_at", null), [
    connection,
    pending,
  ]);



  async function saveStore() {
    if (!store) return;
    if (!isOnline()) {
      toast.error("Connect to the internet to change store settings.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({
          name: name.trim(),
          owner_name: ownerName.trim() || null,
          receipt_footer: footer.trim() || null,
          default_low_stock_threshold: Number(threshold) || 5,
          allow_negative_stock: negative,
          confirm_void: confirmVoid,
        })
        .eq("id", store.id);
      if (error) throw error;
      await refresh();
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Settings" subtitle={email ?? undefined}>
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">Store details</h2>
          <div className="space-y-1.5">
            <Label>Store name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12"
              disabled={!isOwner}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Owner name</Label>
            <Input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="h-12"
              disabled={!isOwner}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Receipt footer</Label>
            <Textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              disabled={!isOwner}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default low-stock alert</Label>
            <Input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="tnum h-12"
              disabled={!isOwner}
            />
          </div>
          <ToggleRow
            label="Allow selling below zero stock"
            description="Useful if your counts are not exact yet."
            checked={negative}
            onChange={setNegative}
            disabled={!isOwner}
          />
          <ToggleRow
            label="Confirm before voiding"
            description="Ask for confirmation when cancelling a sale."
            checked={confirmVoid}
            onChange={setConfirmVoid}
            disabled={!isOwner}
          />
          {isOwner ? (
            <Button className="h-12 w-full" onClick={() => void saveStore()} disabled={busy}>
              Save changes
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only the owner can change store settings.</p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">Offline &amp; Sync</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Connection</dt>
              <dd className="font-medium">
                {online ? (connection === "syncing" ? "Syncing" : "Online") : "Offline"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Last successful sync</dt>
              <dd className="font-medium">
                {lastSyncAt ? formatDateTime(lastSyncAt) : "Not yet"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Waiting to upload</dt>
              <dd className="tnum font-medium">{pending}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Retrying</dt>
              <dd className="tnum font-medium">{failed}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {pending === 0
              ? "Everything on this device is backed up."
              : (lastIssue ??
                `${pending} change${pending > 1 ? "s" : ""} waiting to upload. They are safe on this device.`)}
          </p>
          <Button variant="outline" className="h-12 w-full" onClick={() => void syncNow()}>
            <RefreshCw className="size-4" /> Sync now
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">Install BentaKo</h2>
          <p className="text-sm text-muted-foreground">
            {install.installed
              ? `BentaKo is installed on this device (${platformLabel()}). It opens straight to the POS, even without signal.`
              : install.available
                ? "Add BentaKo to your home screen so it opens like an app and works offline."
                : install.hint}
          </p>
          {!install.installed && install.available ? (
            <Button
              className="h-12 w-full"
              onClick={async () => {
                const outcome = await promptInstall();
                if (outcome === "accepted") toast.success("BentaKo is being installed.");
                if (outcome === "unavailable")
                  toast.error("Your browser did not offer an install prompt.");
              }}
            >
              <Download className="size-4" /> Install BentaKo
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">Running as: {platformLabel()}</p>
        </section>

        {isOwner ? (
          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 className="font-display text-sm font-bold">Data check</h2>
            <p className="text-sm text-muted-foreground">
              Looks for sales without items, totals that don&apos;t match, missing stock movements,
              or stock below zero.
            </p>
            {issues === null ? null : issues.length === 0 ? (
              <p className="text-sm font-medium text-primary">No problems found.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {issues.slice(0, 8).map((issue, i) => (
                  <li key={`${issue.kind}-${i}`} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{issue.label}</span>
                    <span className="font-medium">{issue.reference}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={async () => {
                if (!store) return;
                const found = await runIntegrityCheck(store.id, {
                  allowNegativeStock: store.allow_negative_stock ?? false,
                });
                setIssues(found);
                toast.success(
                  found.length === 0 ? "Your records look complete." : `${found.length} to review.`,
                );
              }}
            >
              <ShieldCheck className="size-4" /> Check my records
            </Button>
          </section>
        ) : null}


        {isOwner ? (
          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 className="font-display text-sm font-bold">Sample data</h2>
            <p className="text-sm text-muted-foreground">
              Add common sari-sari products for testing or training.
            </p>
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={async () => {
                if (!ctx) return;
                const created = await seedDemoProducts(ctx);
                toast.success(`Added ${created} sample products.`);
              }}
            >
              <Sparkles className="size-4" /> Add sample products
            </Button>
          </section>
        ) : null}

        <Button
          variant="outline"
          className="h-12 w-full text-destructive"
          onClick={async () => {
            await signOut();
            void navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          BentaKo works offline. Sales are saved on this device and uploaded when you have signal.
        </p>
      </div>
    </AppShell>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
