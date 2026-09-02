import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, UploadCloud } from "lucide-react";

import { getSyncState, isOnline, subscribeSync, syncNow } from "@/lib/sync-service";
import { cn } from "@/lib/utils";

export function useConnection() {
  const [state, setState] = useState(() => getSyncState());
  useEffect(() => {
    const update = () => setState({ ...getSyncState() });
    update();
    const unsub = subscribeSync(update);
    const onNet = () => update();
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      unsub();
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, []);
  return state;
}

export function ConnectionChip({ className }: { className?: string }) {
  const { connection, pending, failed } = useConnection();
  const offline = connection === "offline" || !isOnline();
  const issue = failed > 0 && !offline;

  const label = offline
    ? pending > 0
      ? `Offline • ${pending} pending`
      : "Offline"
    : issue
      ? "Sync issue"
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
    <button
      type="button"
      onClick={() => void syncNow()}
      title={
        offline
          ? "Offline — sales are saved here and sync automatically later"
          : issue
            ? "Some records are still waiting. Tap to try again."
            : "Tap to sync now"
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
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
    </button>
  );
}

