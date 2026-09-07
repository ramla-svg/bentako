import { fetchServerBuildId, runningBuildId } from "@/lib/build-info";
import { supportsServiceWorker } from "@/lib/platform/platform-service";
import { onCriticalWorkIdle } from "@/lib/sync-service";

const SW_URL = "/sw.js";

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppWorker(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations
        .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").includes(SW_URL))
        .map((r) => r.unregister()),
    );
  } catch {
    /* best effort */
  }
}

/* -------------------------------------------------------- update coordination */

let waitingWorker: ServiceWorker | null = null;
let newerBuildOnServer = false;
let applying = false;
const updateListeners = new Set<(available: boolean) => void>();

function updateAvailable(): boolean {
  return waitingWorker !== null || newerBuildOnServer;
}

function emitUpdate(): void {
  const available = updateAvailable();
  for (const fn of updateListeners) fn(available);
}

/** Subscribe to "a newer BentaKo build is available". */
export function subscribeAppUpdate(fn: (available: boolean) => void): () => void {
  updateListeners.add(fn);
  fn(updateAvailable());
  return () => updateListeners.delete(fn);
}

/**
 * Activates the newest build and reloads. Never interrupts a sale: if a
 * checkout write is in flight, the swap waits until it finishes. IndexedDB is
 * untouched, so pending offline sales and the sync queue survive the swap.
 */
export function applyAppUpdate(): void {
  if (applying) return;
  applying = true;
  onCriticalWorkIdle(() => {
    const worker = waitingWorker;
    if (!worker) {
      // No waiting worker (e.g. plain WebView wrapper): reload past any cache.
      const url = new URL(window.location.href);
      url.searchParams.set("_bk", String(Date.now()));
      window.location.replace(url.toString());
      return;
    }
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    worker.postMessage({ type: "SKIP_WAITING" });
    // Fallback in case the worker never claims this client.
    window.setTimeout(() => {
      if (!reloaded) {
        reloaded = true;
        window.location.reload();
      }
    }, 3000);
  });
}

/**
 * Asks the server whether a newer build was published. Works even without a
 * service worker, which is what makes a link-wrapped Android APK notice new
 * features. Returns true when a newer build exists.
 */
export async function checkForAppUpdate(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration(SW_URL);
    await registration?.update();
  } catch {
    /* best effort */
  }
  const serverBuild = await fetchServerBuildId();
  if (serverBuild && serverBuild !== runningBuildId()) {
    newerBuildOnServer = true;
    pendingServerBuild = serverBuild;
    emitUpdate();
    return true;
  }
  return updateAvailable();
}

/** Remembers which server build was auto-applied, so a reload can never loop. */
let pendingServerBuild: string | null = null;
const AUTO_APPLIED_KEY = "bentako:auto-applied-build";

function alreadyAutoApplied(build: string): boolean {
  try {
    return window.sessionStorage.getItem(AUTO_APPLIED_KEY) === build;
  } catch {
    return false;
  }
}

function markAutoApplied(build: string): void {
  try {
    window.sessionStorage.setItem(AUTO_APPLIED_KEY, build);
  } catch {
    /* private mode: the manual banner still works */
  }
}

/**
 * Background watcher: checks on open, whenever the app returns to the
 * foreground, and hourly. When a newer build exists it is applied right away
 * unless a sale is in progress, in which case it applies after checkout.
 * A given build is only auto-applied once per session; after that the visible
 * update notice takes over instead of reloading repeatedly.
 */
function startUpdateWatcher(): void {
  let lastCheck = 0;
  const check = async () => {
    if (Date.now() - lastCheck < 15_000) return;
    lastCheck = Date.now();
    const available = await checkForAppUpdate();
    if (!available) return;
    const target = pendingServerBuild ?? "waiting-worker";
    if (alreadyAutoApplied(target)) return;
    markAutoApplied(target);
    applyAppUpdate();
  };
  void check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("online", () => void check());
  window.setInterval(() => void check(), 60 * 60 * 1000);
}

function trackRegistration(registration: ServiceWorkerRegistration): void {
  const check = () => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting;
      emitUpdate();
      applyAppUpdate();
    }
  };
  check();
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") check();
    });
  });
}

/**
 * Registers the offline app-shell service worker. Refuses in dev, in the Lovable
 * editor preview, inside iframes, and when `?sw=off` is present — and cleans up
 * any stale registration in those cases. The version watcher still runs in
 * production so a wrapped APK without a worker also picks up new builds.
 */
export function registerServiceWorker(): void {
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const inIframe = window.self !== window.top;
  const refuse =
    !import.meta.env.PROD || inIframe || isPreviewHost(window.location.hostname) || killSwitch;

  if (refuse) {
    if (supportsServiceWorker()) void unregisterAppWorker();
    return;
  }

  if (supportsServiceWorker()) {
    // Register immediately instead of waiting for every remote font/image. This
    // gives the worker the best chance to cache the shell during first setup.
    void navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => trackRegistration(registration))
      .catch(() => {
        /* offline app shell is best-effort */
      });
  }

  startUpdateWatcher();
}

