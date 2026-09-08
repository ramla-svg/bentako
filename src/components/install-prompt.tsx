import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Check, Download, Share2 } from "lucide-react";

import brandMark from "@/assets/bentako-mark.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  isInstallPromptSnoozed,
  markInstallPromptShown,
  promptInstall,
  snoozeInstallPrompt,
  useInstallState,
  wasInstallPromptShown,
} from "@/lib/platform/install-service";
import { isNative } from "@/lib/platform/platform-service";

const DELAY_MS = 12_000;

const BENEFITS = [
  "Open directly from your home screen",
  "Faster access to your transaction log",
  "Keeps working with offline features",
  "No Play Store needed",
];

/**
 * Polite install invitation. Never shows on first paint, never triggers the
 * browser dialog by itself, and disappears for good once BentaKo is installed.
 */
export function InstallPrompt() {
  const { available, installed, ios, hint } = useInstallState();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const onDashboard = useRouterState({
    select: (s) => s.location.pathname.startsWith("/dashboard"),
  });

  // Wait for the delay, or let the dashboard unlock it right away.
  useEffect(() => {
    if (onDashboard) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [onDashboard]);

  const eligible = !installed && !isNative() && (available || ios);

  useEffect(() => {
    if (!ready || !eligible) return;
    if (wasInstallPromptShown() || isInstallPromptSnoozed()) return;
    markInstallPromptShown();
    setOpen(true);
  }, [ready, eligible]);

  useEffect(() => {
    if (installed) setOpen(false);
  }, [installed]);

  if (!eligible) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) snoozeInstallPrompt();
        setOpen(next);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pb-6 pt-5">
        <SheetHeader className="space-y-0 p-0 text-left">
          <div className="flex items-center gap-3">
            <img
              src={brandMark}
              alt=""
              width={816}
              height={816}
              loading="lazy"
              className="size-12 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <SheetTitle className="font-display text-lg font-bold">Install BentaKo</SheetTitle>
              <p className="text-sm text-muted-foreground">
                Add BentaKo to your phone for faster access and an app-like experience.
              </p>
            </div>
          </div>
        </SheetHeader>

        <ul className="mt-4 space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {ios ? (
          <>
            <div className="mt-4 space-y-2 rounded-2xl border bg-muted/40 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <Share2 className="size-4" /> Install BentaKo on iPhone
              </p>
              <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                <li>Tap the Share button in Safari.</li>
                <li>Select “Add to Home Screen”.</li>
                <li>Tap “Add”.</li>
              </ol>
            </div>
            <Button
              className="mt-4 h-12 w-full"
              onClick={() => {
                snoozeInstallPrompt();
                setOpen(false);
              }}
            >
              Got it
            </Button>
          </>
        ) : (
          <div className="mt-5 space-y-2">
            <Button
              className="h-12 w-full"
              onClick={async () => {
                const outcome = await promptInstall();
                if (outcome === "unavailable") return;
                setOpen(false);
              }}
            >
              <Download className="size-4" /> Install BentaKo
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-full"
              onClick={() => {
                snoozeInstallPrompt();
                setOpen(false);
              }}
            >
              Maybe Later
            </Button>
            <p className="text-center text-xs text-muted-foreground">{hint}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
