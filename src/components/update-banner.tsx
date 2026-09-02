import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyAppUpdate, subscribeAppUpdate } from "@/lib/register-sw";

/**
 * Subtle "BentaKo update available" notice. The new build is already downloaded;
 * it is only applied when the user taps, so an active sale is never interrupted.
 * Local data (products, pending sales, queue) is never cleared by an update.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeAppUpdate(setAvailable), []);

  if (!available || dismissed) return null;

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-24 z-40 px-4 lg:bottom-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Download className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">BentaKo update available</p>
          <p className="text-xs text-muted-foreground">
            Your saved sales stay on this device.
          </p>
        </div>
        <Button size="sm" className="h-9 shrink-0" onClick={() => applyAppUpdate()}>
          Update when ready
        </Button>
        <button
          type="button"
          aria-label="Dismiss update notice"
          onClick={() => setDismissed(true)}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
