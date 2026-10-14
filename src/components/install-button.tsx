import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { promptInstall, requestInstallCard, useInstallState } from "@/lib/platform/install-service";

/** Shared entry point; the global install card owns all manual guidance. */
export function InstallButton({ className }: { className?: string }) {
  const { available, installed } = useInstallState();
  const [busy, setBusy] = useState(false);
  if (installed) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      title="Web app installation — walang .exe download"
      disabled={busy}
      onClick={async () => {
        if (!available) return requestInstallCard();
        setBusy(true);
        const outcome = await promptInstall();
        setBusy(false);
        if (outcome === "unavailable") requestInstallCard();
      }}
    >
      <Smartphone aria-hidden="true" className="lg:hidden" />
      <span className="lg:hidden">I-install sa phone</span>
      <Monitor aria-hidden="true" className="hidden lg:block" />
      <span className="hidden lg:inline">Install sa computer</span>
    </Button>
  );
}