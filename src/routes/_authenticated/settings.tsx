import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  Crown,
  Download,
  FileText,
  ImagePlus,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

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
import { runningBuildId } from "@/lib/build-info";
import { formatDateTime } from "@/lib/format";
import { runIntegrityCheck, type IntegrityIssue } from "@/lib/integrity";
import { applyAppUpdate, checkForAppUpdate } from "@/lib/register-sw";
import { db, getSetting } from "@/lib/local-db";
import { deleteMyAccount } from "@/lib/account.functions";
import { useIsNativeApp } from "@/hooks/use-native-app";
import { promptInstall, useInstallState } from "@/lib/platform/install-service";
import { platformLabel } from "@/lib/platform/platform-service";
import { seedDemoProducts } from "@/lib/repo";
import { isOnline, syncNow } from "@/lib/sync-service";
import { isBillingAdmin } from "@/lib/billing.functions";
import { removeStoreLogo, uploadStoreLogo, useStoreLogo } from "@/lib/store-logo";
import { listStoreDevices, releaseDevice, type StoreDevice } from "@/lib/devices.functions";
import { deviceId } from "@/lib/device-id";


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
  const { store, ctx, role, email, pro, refresh, signOut } = useAppSession();
  const navigate = useNavigate();
  const isOwner = role === "owner";

  const [name, setName] = useState(store?.name ?? "");
  const [ownerName, setOwnerName] = useState(store?.owner_name ?? "");
  const [footer, setFooter] = useState(store?.receipt_footer ?? "");
  const [threshold, setThreshold] = useState(String(store?.default_low_stock_threshold ?? 5));
  const [negative, setNegative] = useState(store?.allow_negative_stock ?? false);
  const [confirmVoid, setConfirmVoid] = useState(store?.confirm_void ?? true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  const [issues, setIssues] = useState<IntegrityIssue[] | null>(null);

  // Receipt logo (Pro): picked on the phone, shrunk, then kept in cloud storage.
  const logoUrl = useStoreLogo(store?.logo_url);
  const logoInput = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  // Owner tools (BentaKo staff only) and the list of phones using this shop.
  const checkAdmin = useServerFn(isBillingAdmin);
  const loadDevices = useServerFn(listStoreDevices);
  const dropDevice = useServerFn(releaseDevice);
  const [isAdmin, setIsAdmin] = useState(false);
  const [devices, setDevices] = useState<StoreDevice[]>([]);
  const thisDevice = deviceId();

  useEffect(() => {
    void checkAdmin()
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false));
  }, [checkAdmin]);

  useEffect(() => {
    void loadDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, [loadDevices]);
  const install = useInstallState();
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
          receipt_footer: pro ? footer.trim() || null : store.receipt_footer ?? null,
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
    <AppShell back title="Settings" subtitle={email ?? undefined}>
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
            <Label>Receipt footer{pro ? "" : " · Pro"}</Label>
            <Textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              disabled={!isOwner || !pro}
            />
            {!pro ? (
              <p className="text-xs text-muted-foreground">
                Your own message on receipts comes with Pro. Free receipts show “Powered by
                BentaKo”.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Receipt logo{pro ? "" : " · Pro"}</Label>
            <div className="flex items-center gap-3">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-secondary">
                {logoUrl ? (
                  <img src={logoUrl} alt="Receipt logo" className="size-full object-contain" />
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={!isOwner || !pro || logoBusy}
                  onClick={() => logoInput.current?.click()}
                >
                  {logoBusy ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
                </Button>
                {logoUrl && isOwner && pro ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 text-destructive"
                    disabled={logoBusy}
                    onClick={async () => {
                      if (!store) return;
                      setLogoBusy(true);
                      try {
                        await removeStoreLogo(store.id, store.logo_url);
                        await refresh();
                        toast.success("Logo removed.");
                      } catch {
                        toast.error("Could not remove the logo.");
                      } finally {
                        setLogoBusy(false);
                      }
                    }}
                  >
                    <X className="size-4" /> Remove logo
                  </Button>
                ) : null}
              </div>
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !store) return;
                if (!isOnline()) {
                  toast.error("Connect to the internet to upload your logo.");
                  return;
                }
                setLogoBusy(true);
                try {
                  await uploadStoreLogo(store.id, file);
                  await refresh();
                  toast.success("Logo saved — it now shows on your receipts.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not upload that image.");
                } finally {
                  setLogoBusy(false);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {pro
                ? "Your logo shows at the top of the receipt on screen and when you print. A square picture works best."
                : "Your own logo on receipts comes with Pro."}
            </p>
            {!pro ? (
              <Button asChild variant="outline" className="h-11 w-full">
                <Link to="/upgrade">See BentaKo Pro</Link>
              </Button>
            ) : null}
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
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <Crown className="size-4 text-primary" /> Your plan
          </h2>
          <p className="text-sm">
            <span className="font-semibold">{pro ? "BentaKo Pro" : "Free"}</span>
            {pro && store?.plan_expires_at ? (
              <span className="text-muted-foreground"> · renews {formatDateTime(store.plan_expires_at)}</span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {pro
              ? "Unlimited products, cloud backup, extra phones and cashier accounts are unlocked."
              : "Free covers selling, receipts, cash and utang on this phone — up to 60 products, 7 days of reports, no cloud backup."}
          </p>
          <Button asChild variant={pro ? "outline" : "default"} className="h-12 w-full">
            <Link to="/upgrade">
              {pro ? "Manage plan" : nativeApp ? "What BentaKo Pro includes" : "See BentaKo Pro — ₱99/month"}
            </Link>
          </Button>
          {nativeApp && !pro ? (
            <p className="text-xs text-muted-foreground">
              Your plan is managed on your BentaKo account at bentako.lovable.app. Changes show up
              here automatically.
            </p>
          ) : null}
        </section>

        {isAdmin ? (
          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold">
              <Wrench className="size-4 text-primary" /> Owner tools
            </h2>
            <p className="text-sm text-muted-foreground">
              Set the GCash name, number and QR code shops pay to, and confirm payments waiting for
              Pro.
            </p>
            <Button asChild className="h-12 w-full justify-between">
              <Link to="/bk-admin">
                GCash details &amp; Pro approvals <ChevronRight className="size-4" />
              </Link>
            </Button>
          </section>
        ) : null}

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <Smartphone className="size-4 text-primary" /> Phones using this shop
          </h2>
          <p className="text-sm text-muted-foreground">
            {pro
              ? `BentaKo Pro covers 3 phones. ${devices.length} in use.`
              : `The free plan covers 1 phone. ${devices.length} in use — Pro adds up to 3.`}
          </p>
          {devices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No phones recorded yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border text-sm">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {d.label ?? "Phone"}
                      {d.device_id === thisDevice ? " · this phone" : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Last used {formatDateTime(d.last_seen_at)}
                    </span>
                  </span>
                  {isOwner && d.device_id !== thisDevice ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${d.label ?? "phone"}`}
                      onClick={async () => {
                        try {
                          await dropDevice({ data: { id: d.id } });
                          setDevices((list) => list.filter((row) => row.id !== d.id));
                          toast.success("Phone removed.");
                        } catch {
                          toast.error("Could not remove that phone.");
                        }
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
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
          {pro ? (
            <>
              <p className="text-sm text-muted-foreground">
                {pending === 0
                  ? "Everything on this device is backed up."
                  : (lastIssue ??
                    `${pending} change${pending > 1 ? "s" : ""} waiting to upload. They are safe on this device.`)}
              </p>
              <p className="text-xs text-muted-foreground">
                Activity history and receipt photos are kept on this phone only — they are never
                uploaded. Sales, products, cash entries and utang are backed up.
              </p>
              <Button variant="outline" className="h-12 w-full" onClick={() => void syncNow()}>
                <RefreshCw className="size-4" /> Sync now
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                On the free plan everything is saved on this phone only. Selling, receipts, cash and
                utang all keep working — nothing is uploaded.
              </p>
              <p className="text-xs text-muted-foreground">
                Your records are held ready on this phone. The moment you go Pro, they are backed up
                so a new phone can be restored.
              </p>
              <Button asChild variant="outline" className="h-12 w-full">
                <Link to="/upgrade">Turn on cloud backup with Pro</Link>
              </Button>
            </>
          )}

        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">
            {install.installed ? "BentaKo is installed" : "Install BentaKo"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {install.installed
              ? `BentaKo is installed on this device (${platformLabel()}). It opens straight to the POS, even without signal.`
              : install.available
                ? "Add BentaKo to your home screen so it opens like an app and works offline."
                : install.ios
                  ? "Install BentaKo on iPhone:"
                  : install.hint}
          </p>
          {!install.installed && install.ios ? (
            <ol className="ml-4 list-decimal space-y-1 text-sm text-muted-foreground">
              <li>Tap the Share button in Safari.</li>
              <li>Select “Add to Home Screen”.</li>
              <li>Tap “Add”.</li>
            </ol>
          ) : null}
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


        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-display text-sm font-bold">App version</h2>
          <p className="text-sm text-muted-foreground">
            BentaKo updates itself when a new version is published. If this device still shows old
            features, tap below to check now — your products, stock and saved sales are never
            cleared by an update.
          </p>
          <p className="text-xs text-muted-foreground">
            Installed version: <span className="tnum">{runningBuildId()}</span>
          </p>
          <Button
            variant="outline"
            className="h-12 w-full"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                const available = await checkForAppUpdate();
                if (available) {
                  toast.success("New version found — updating now.");
                  applyAppUpdate();
                } else {
                  toast.success("You already have the newest version.");
                }
              } finally {
                setChecking(false);
              }
            }}
          >
            <RefreshCw className="size-4" /> {checking ? "Checking…" : "Check for updates"}
          </Button>
          <p className="text-xs text-muted-foreground">
            If you use a wrapper app around the BentaKo link, turn off its own &quot;offline
            mode&quot; or page caching so it can always reach the newest version.
          </p>
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

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <FileText className="size-4 text-primary" /> Legal
          </h2>
          <div className="divide-y rounded-xl border text-sm">
            <Link to="/terms" className="flex items-center justify-between gap-2 px-3 py-3">
              Terms of Service <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            <Link to="/privacy" className="flex items-center justify-between gap-2 px-3 py-3">
              Privacy Policy <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            <Link
              to="/delete-account"
              className="flex items-center justify-between gap-2 px-3 py-3"
            >
              How account deletion works <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </section>

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

        <section className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-destructive">
            <Trash2 className="size-4" /> Delete my account
          </h2>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "This removes your sign-in and your whole shop: sales, products, stock, cash, utang, expenses and any cashier sign-ins. It cannot be undone."
              : "This removes your own sign-in and profile. The shop and its records stay with the owner."}
          </p>
          <p className="text-xs text-muted-foreground">
            Want a copy of your figures first? Export them from Reports before you delete.
          </p>
          <Label htmlFor="delete-confirm">
            Type <span className="font-bold">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            className="h-12"
            autoComplete="off"
          />
          <Button
            variant="destructive"
            className="h-12 w-full"
            disabled={deleteText.trim() !== "DELETE" || deleting}
            onClick={async () => {
              if (!isOnline()) {
                toast.error("Connect to the internet to delete your account.");
                return;
              }
              setDeleting(true);
              try {
                await removeAccount({ data: { confirm: "DELETE" } });
                await clearLocalData();
                await signOut();
                toast.success("Your account and records were deleted.");
                void navigate({ to: "/auth", replace: true });
              } catch {
                toast.error("Could not delete the account. Please try again.");
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete my account permanently"}
          </Button>
        </section>

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
