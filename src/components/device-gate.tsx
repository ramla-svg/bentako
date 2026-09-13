/**
 * Counts the phones a shop uses. Free = 1 phone, BentaKo Pro = 3 phones and
 * 2 cashier sign-ins. Nobody is locked out of their own records: when the shop
 * is full, the owner picks a phone to release or goes Pro.
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Crown, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSession } from "@/hooks/use-app-session";
import { deviceId, deviceLabel } from "@/lib/device-id";
import {
  listStoreDevices,
  registerDevice,
  releaseDevice,
  type StoreDevice,
} from "@/lib/devices.functions";
import { formatDateTime } from "@/lib/format";
import { isOnline } from "@/lib/sync-service";

export function DeviceGate() {
  const { status, store, pro } = useAppSession();
  const check = useServerFn(registerDevice);
  const release = useServerFn(releaseDevice);
  const [blocked, setBlocked] = useState<null | "device_limit" | "cashier_limit">(null);
  const [devices, setDevices] = useState<StoreDevice[]>([]);
  const [limit, setLimit] = useState(1);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (status !== "ready" || !store?.id || !isOnline()) return;
    try {
      const result = await check({ data: { deviceId: deviceId(), label: deviceLabel() } });
      setDevices(result.devices);
      setLimit(result.limit);
      setBlocked(result.status === "ok" ? null : result.status);
    } catch {
      // Never block selling because the check could not reach the cloud.
      setBlocked(null);
    }
  }, [check, status, store?.id]);

  useEffect(() => {
    void run();
  }, [run]);

  const oldest = devices.filter((d) => !d.current)[0];

  return (
    <Dialog open={blocked !== null} onOpenChange={(open) => (open ? null : setBlocked(null))}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-lg p-4 sm:w-[calc(100%-3rem)] sm:p-6 md:max-w-2xl">
        <DialogHeader className="min-w-0 pr-7 text-left">
          <DialogTitle className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 text-xl leading-tight sm:text-2xl">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              {blocked === "cashier_limit" ? (
                <Crown className="size-5" />
              ) : (
                <Smartphone className="size-5" />
              )}
            </span>
            <span className="min-w-0 pt-1">
              {blocked === "cashier_limit"
                ? "Cashier sign-ins are full"
                : "This shop already uses its phones"}
            </span>
          </DialogTitle>
          <DialogDescription className="pl-12 text-sm leading-relaxed sm:text-base">
            {blocked === "cashier_limit"
              ? pro
                ? `BentaKo Pro allows ${limit} cashier sign-ins. Ask the owner to remove a cashier first.`
                : "On the free plan only the owner can sign in. BentaKo Pro adds 2 cashier sign-ins."
              : `Your plan covers ${limit} phone${limit > 1 ? "s" : ""}. Release one to use this phone instead, or go Pro for 3 phones.`}
          </DialogDescription>
        </DialogHeader>

        <div
          className={
            blocked === "device_limit" && devices.length > 0
              ? "grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.85fr)] md:items-start"
              : "min-w-0"
          }
        >
          {blocked === "device_limit" && devices.length > 0 ? (
            <ul className="max-h-56 min-w-0 divide-y overflow-y-auto rounded-lg border text-sm sm:max-h-64">
              {devices.map((d) => (
                <li key={d.id} className="min-w-0 px-4 py-3">
                  <span className="block break-words font-medium leading-snug">
                    {d.label ?? "Phone"}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                    Last used {formatDateTime(d.last_seen_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="min-w-0 space-y-2">
            {blocked === "device_limit" && oldest ? (
              <Button
                className="min-h-12 h-auto w-full whitespace-normal px-4 py-3 text-center leading-snug"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await release({ data: { id: oldest.id } });
                    toast.success("That phone was released.");
                    await run();
                  } catch {
                    toast.error("Could not release that phone.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                <span className="min-w-0 break-words">
                  Release “{oldest.label ?? "Phone"}” and use this one
                </span>
              </Button>
            ) : null}
            {!pro ? (
              <Button
                asChild
                variant="outline"
                className="min-h-12 h-auto w-full whitespace-normal px-4 py-3 text-center leading-snug"
              >
                <Link to="/upgrade" onClick={() => setBlocked(null)}>
                  <Crown className="size-4" /> See BentaKo Pro
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" className="h-11 w-full" onClick={() => setBlocked(null)}>
              Not now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
