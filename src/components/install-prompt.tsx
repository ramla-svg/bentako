import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Check, Download } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  GUIDE_STEPS,
  isInstallPromptSnoozed,
  markInstallPromptShown,
  onInstallCardRequest,
  promptInstall,
  snoozeInstallPrompt,
  useInstallState,
  wasInstallPromptShown,
} from "@/lib/platform/install-service";
import { isNative } from "@/lib/platform/platform-service";

const DELAY_MS = 3_000;

const BENEFITS = [
  "Mabilis buksan mula sa home screen o desktop",
  "Offline na pagtatala pagkatapos ng unang setup",
  "Hindi kailangan ng Play Store",
  "Libre i-install — walang bayad na kailangan",
];

/** True when another dialog/sheet is already open, so we never stack modals. */
function otherModalOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/**
 * The single global install card. Opens automatically once per session after a
 * delay (landing or dashboard), or immediately when a button calls
 * requestInstallCard(). It never opens the browser dialog by itself.
 */
export function InstallPrompt() {
  const { available, installed, guide } = useInstallState();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const manual = useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onDashboard = pathname.startsWith("/dashboard");

  useEffect(() => {
    if (onDashboard) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [onDashboard]);

  const suppressed = installed || isNative();

  // Automatic invitation: one-tap prompt when available, otherwise device steps.
  useEffect(() => {
    if (!ready || suppressed) return;
    void guide;
    if (wasInstallPromptShown() || isInstallPromptSnoozed() || otherModalOpen()) return;
    markInstallPromptShown();
    manual.current = false;
    setOpen(true);
  }, [ready, suppressed, available, guide]);

  // Manual open from a button: always allowed, even when snoozed.
  useEffect(
    () =>
      onInstallCardRequest(() => {
        manual.current = true;
        setFailed(false);
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (installed) setOpen(false);
  }, [installed]);

  if (suppressed) return null;

  const close = (snooze: boolean) => {
    if (snooze && !manual.current) snoozeInstallPrompt();
    setOpen(false);
  };

  const showSteps = !available || failed;

  const body = (
    <>
      <div className="flex items-center gap-3">
        <BrandMark className="size-12" />
        <div className="min-w-0 text-left">
          <TitleTag isMobile={isMobile}>I-install ang BentaKo</TitleTag>
          <p className="text-sm text-muted-foreground">
            Web app ito para sa phone o computer — walang .exe download.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {showSteps ? (
        <div className="mt-4 rounded-2xl border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">Paano i-install</p>
          <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
            {GUIDE_STEPS[guide].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="mt-5 space-y-2">
        {!showSteps ? (
          <Button
            className="h-12 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const outcome = await promptInstall();
              setBusy(false);
              if (outcome === "unavailable") setFailed(true);
              else if (outcome !== "busy") setOpen(false);
            }}
          >
            <Download className="size-4" aria-hidden="true" /> I-install ang BentaKo
          </Button>
        ) : null}
        <Button
          variant={showSteps ? "default" : "ghost"}
          className="h-11 w-full"
          onClick={() => close(true)}
        >
          {showSteps ? "Sige" : "Mamaya na"}
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close(true))}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl px-5 pb-6 pt-5"
          aria-describedby={undefined}
        >
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close(true))}>
      <DialogContent className="max-w-sm rounded-3xl" aria-describedby={undefined}>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function TitleTag({ isMobile, children }: { isMobile: boolean; children: string }) {
  const cls = "font-display text-lg font-bold";
  return isMobile ? (
    <SheetTitle className={cls}>{children}</SheetTitle>
  ) : (
    <DialogTitle className={cls}>{children}</DialogTitle>
  );
}
