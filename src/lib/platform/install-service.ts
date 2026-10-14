import { useEffect, useState } from "react";

import { isNative, isStandalone, platformOS } from "./platform-service";

/**
 * Install ("Add to Home screen") abstraction. The browser dialog is only ever
 * opened from a user click; the deferred event is single-use and is cleared
 * after any outcome so a stale object is never re-prompted.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable" | "busy";

let deferred: BeforeInstallPromptEvent | null = null;
let inFlight = false;
let installedEvent = false;
const listeners = new Set<() => void>();
const openRequests = new Set<() => void>();
let bound = false;

function emit(): void {
  for (const fn of listeners) fn();
}

export function bindInstallListeners(): void {
  if (bound || typeof window === "undefined" || typeof window.addEventListener !== "function")
    return;
  bound = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // suppress the browser's own mini-infobar
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedEvent = true;
    emit();
  });
}

// Bind at module load so an early beforeinstallprompt is not missed.
bindInstallListeners();

export function canInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<InstallOutcome> {
  if (inFlight) return "busy";
  if (!deferred) return "unavailable";
  const event = deferred;
  inFlight = true;
  // Single-use: consume it now, whatever the outcome.
  deferred = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  } finally {
    inFlight = false;
    emit();
  }
}

/** Ask the single global install card to open (from a user click). */
export function requestInstallCard(): void {
  for (const fn of openRequests) fn();
}

export function onInstallCardRequest(fn: () => void): () => void {
  openRequests.add(fn);
  return () => openRequests.delete(fn);
}

/** Test-only reset of module state. */
export function __resetInstallForTests(event: BeforeInstallPromptEvent | null = null): void {
  deferred = event;
  inFlight = false;
  installedEvent = false;
}

const DISMISS_KEY = "bentako_install_dismissed_until";
const SESSION_KEY = "bentako_install_shown";
const DISMISS_DAYS = 7;

/** Remember a "Maybe later" for a week on this device. */
export function snoozeInstallPrompt(now = Date.now()): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(now + DISMISS_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    /* storage unavailable */
  }
}

export function isInstallPromptSnoozed(now = Date.now()): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Number.isFinite(until) && until > now;
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

export type InstallGuide =
  | "ios-safari"
  | "ios-other"
  | "mac-safari"
  | "firefox"
  | "in-app"
  | "chromium"
  | "chromium-desktop"
  | "other";

/** Which manual steps fit this browser when no prompt event is available. */
export function installGuideFor(ua: string): InstallGuide {
  if (/FBAN|FBAV|Instagram|Line\/|; wv\)|Messenger|TikTok/i.test(ua)) return "in-app";
  const ios = /iphone|ipad|ipod/i.test(ua);
  if (ios) return /CriOS|FxiOS|EdgiOS/i.test(ua) ? "ios-other" : "ios-safari";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Edg\/|Chrome\/|Chromium\//i.test(ua))
    return /android|mobile/i.test(ua) ? "chromium" : "chromium-desktop";
  if (/Macintosh/i.test(ua) && /Safari\//i.test(ua)) return "mac-safari";
  return "other";
}

export const GUIDE_STEPS: Record<InstallGuide, string[]> = {
  "ios-safari": [
    "I-tap ang Share button sa Safari.",
    "Piliin ang “Add to Home Screen”.",
    "I-tap ang “Add”.",
  ],
  "ios-other": ["Buksan ang pahinang ito sa Safari.", "Share → “Add to Home Screen” → “Add”."],
  "mac-safari": ["Sa menu bar ng Safari, piliin ang File → “Add to Dock”."],
  firefox: ["Hindi pa sinusuportahan ng Firefox ang pag-install.", "Buksan ito sa Chrome o Edge."],
  "in-app": [
    "Hindi makakapag-install mula sa app browser na ito.",
    "Buksan ang link sa Chrome (Android) o Safari (iPhone).",
  ],
  chromium: ["Buksan ang menu ng browser (⋮).", "Piliin ang “Install app” o “Add to Home screen”."],
  "chromium-desktop": [
    "Sa Chrome o Edge, hanapin ang install icon sa address bar o buksan ang menu (⋮ / …).",
    "Piliin ang “Install BentaKo” o Apps → “Install this site as an app”, kung available.",
  ],
  other: ["Buksan ang BentaKo sa Chrome, Edge, o Safari para ma-install."],
};

export type InstallState = {
  /** A real install prompt is available right now. */
  available: boolean;
  /** Already running as an installed app (or native shell). */
  installed: boolean;
  /** iOS: no prompt event exists, show the Share-sheet steps instead. */
  ios: boolean;
  guide: InstallGuide;
  /** Manual instructions to show when no prompt event exists. */
  hint: string;
};

export function useInstallState(): InstallState {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState<InstallGuide>("other");

  useEffect(() => {
    bindInstallListeners();
    setGuide(installGuideFor(window.navigator.userAgent));
    const update = () => {
      setAvailable(canInstall());
      setInstalled(installedEvent || isStandalone() || isNative());
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

  return { available, installed, ios: os === "ios", guide, hint };
}
