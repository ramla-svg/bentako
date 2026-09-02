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
  const { connection, pending } = useConnection();
  const offline = connection === "offline" || !isOnline();

  const label = offline
    ? "Offline"
    : connection === "syncing"
      ? "Syncing"
      : pending > 0
        ? `${pending} pending`
        : "Online";

  const Icon = offline ? CloudOff : connection === "syncing" ? RefreshCw : pending > 0 ? UploadCloud : Cloud;

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={offline ? "Offline — sales will sync automatically later" : "Tap to sync now"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        offline
          ? "border-warning/40 bg-warning/15 text-accent-foreground"
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
