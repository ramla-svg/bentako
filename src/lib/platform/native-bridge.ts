/**
 * Capacitor bridge — the ONLY place that talks to native plugins.
 *
 * Everything is loaded with dynamic `import()` behind an `isNative()` check, so
 * the web/PWA build never pulls native code in and keeps working unchanged.
 *
 *   UI / sync engine  ->  platform services (network, share, back)  ->  here
 */

import { runBackHandlers } from "@/hooks/use-back-handler";
import { setNativeOnline } from "@/lib/platform/network-service";
import { isNative } from "@/lib/platform/platform-service";

let started = false;

/** Called once from the app root. Safe (no-op) on web. */
export function initNativeBridge(): void {
  if (started || typeof window === "undefined" || !isNative()) return;
  started = true;
  void wire();
}

async function wire(): Promise<void> {
  await Promise.allSettled([wireNetwork(), wireLifecycle(), wireStatusBar(), hideSplash()]);
}

/* ------------------------------------------------------------------ network */

async function wireNetwork(): Promise<void> {
  try {
    const { Network } = await import("@capacitor/network");
    const status = await Network.getStatus();
    setNativeOnline(status.connected);
    await Network.addListener("networkStatusChange", (s) => setNativeOnline(s.connected));
  } catch {
    /* plugin unavailable — browser online/offline events still apply */
  }
}

/* ---------------------------------------------------------------- lifecycle */

async function wireLifecycle(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");

    // Resume: re-check connectivity, then let the sync engine drain the queue.
    // `syncNow()` is internally single-flight, so this can never double-sync.
    await App.addListener("appStateChange", async ({ isActive }) => {
      if (!isActive) return;
      try {
        const { Network } = await import("@capacitor/network");
        const status = await Network.getStatus();
        setNativeOnline(status.connected);
      } catch {
        /* keep whatever status we had */
      }
      const { isOnline, syncNow } = await import("@/lib/sync-service");
      if (isOnline()) void syncNow();
    });

    // Android hardware back button:
    //   open sheet/dialog -> close it
    //   nested page       -> browser history back
    //   root page         -> normal Android exit
    await App.addListener("backButton", ({ canGoBack }) => {
      if (runBackHandlers()) return;
      if (canGoBack && window.history.length > 1) {
        window.history.back();
        return;
      }
      void App.exitApp();
    });
  } catch {
    /* plugin unavailable — web history behaviour is unchanged */
  }
}

/* ------------------------------------------------- status bar / safe areas */

async function wireStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Content stays below the status bar; safe-area CSS handles the rest.
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#1f5f47" });
  } catch {
    /* iOS/older Android or plugin missing — layout still uses safe-area insets */
  }
}

async function hideSplash(): Promise<void> {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* no splash plugin — nothing to hide */
  }
}
