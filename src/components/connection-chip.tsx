import { useEffect, useState } from "react";
import { AlertTriangle, Cloud, CloudOff, RefreshCw, UploadCloud } from "lucide-react";

import { subscribeNetwork } from "@/lib/platform/network-service";
import { getSyncState, isOnline, subscribeSync, retrySync } from "@/lib/sync-service";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function useConnection() {
  const [state, setState] = useState(() => getSyncState());
  useEffect(() => {
    const update = () => setState({ ...getSyncState() });
    update();
    const unsubSync = subscribeSync(update);
    const unsubNet = subscribeNetwork(update);
    return () => {
      unsubSync();
      unsubNet();
    };
  }, []);
  return state;
}

export function ConnectionChip({ className }: { className?: string }) {
  const { connection, pending, failed, backupEnabled, authRequired, lastIssue } = useConnection();
  const offline = connection === "offline" || !isOnline();
  const issue = backupEnabled && (failed > 0 || authRequired || !!lastIssue) && !offline;

  const label = !backupEnabled
    ? offline
      ? "Offline • Saved here"
      : "Saved on device"
    : offline
      ? pending > 0
        ? `Offline • ${pending} pending`
        : "Offline"
      : issue
        ? authRequired
          ? "Reconnect account"
          : "Sync issue"
        : connection === "syncing"
          ? pending > 0
            ? `Syncing • ${pending} left`
            : "Syncing"
          : pending > 0
            ? `${pending} pending`
            : "Synced";

  const Icon = offline
    ? CloudOff
    : issue
      ? AlertTriangle
      : connection === "syncing"
        ? RefreshCw
        : pending > 0
          ? UploadCloud
          : Cloud;

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => void retrySync()}
      title={
        !backupEnabled
          ? "Saved on this device. Cloud backup is available with Pro."
          : offline
            ? "Offline — sales are saved here and sync automatically later"
            : issue
              ? (lastIssue ?? "Some records are still waiting. Tap to try again.")
              : "Tap to sync now"
      }
      className={cn(
        "h-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        offline
          ? "border-warning/40 bg-warning/15 text-accent-foreground"
          : issue
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : pending > 0
              ? "border-accent/40 bg-accent/15 text-accent-foreground"
              : "border-primary/25 bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className={cn("size-3.5", connection === "syncing" && "animate-spin")} />
      {label}
    </Button>
  );
}
