import { useEffect, useState } from "react";

import { isNative, isStandalone, platformOS } from "./platform-service";

/**
 * Install ("Add to Home screen") abstraction. We never auto-prompt: the deferred
 * event is captured and surfaced only where the user asks for it (Settings).
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let bound = false;

function emit(): void {
  for (const fn of listeners) fn();
}

function bind(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // suppress the browser's own mini-infobar
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") deferred = null;
    emit();
    return outcome;
  } catch {
    return "unavailable";
  }
}

const DISMISS_KEY = "bentako_install_dismissed_until";
const SESSION_KEY = "bentako_install_shown";
const DISMISS_DAYS = 7;

/** Remember a "Maybe later" for a week on this device. */
export function snoozeInstallPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    /* storage unavailable */
  }
}

export function isInstallPromptSnoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function markInstallPromptShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function wasInstallPromptShown(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export type InstallState = {
  /** A real install prompt is available right now. */
  available: boolean;
  /** Already running as an installed app (or native shell). */
  installed: boolean;
  /** iOS Safari: no prompt event exists, show the Share-sheet steps instead. */
  ios: boolean;
  /** Manual instructions to show when no prompt event exists. */
  hint: string;
};

export function useInstallState(): InstallState {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    bind();
    const update = () => {
      setAvailable(canInstall());
      setInstalled(isStandalone() || isNative());
    };
    update();
    listeners.add(update);
    const media = window.matchMedia?.("(display-mode: standalone)");
    media?.addEventListener?.("change", update);
    return () => {
      listeners.delete(update);
      media?.removeEventListener?.("change", update);
    };
  }, []);

  const os = platformOS();
  const hint =
    os === "ios"
      ? "In Safari, tap Share then “Add to Home Screen”."
      : "In Chrome, open the browser menu and tap “Install app” or “Add to Home screen”.";

  return { available, installed, ios: os === "ios", hint };
}

