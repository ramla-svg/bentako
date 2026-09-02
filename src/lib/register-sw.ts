import { supportsServiceWorker } from "@/lib/platform/platform-service";

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
const updateListeners = new Set<(available: boolean) => void>();

function emitUpdate(): void {
  const available = waitingWorker !== null;
  for (const fn of updateListeners) fn(available);
}

/** Subscribe to "a newer BentaKo build is downloaded and waiting". */
export function subscribeAppUpdate(fn: (available: boolean) => void): () => void {
  updateListeners.add(fn);
  fn(waitingWorker !== null);
  return () => updateListeners.delete(fn);
}

/**
 * Activates the waiting build and reloads. Only ever called from an explicit
 * user action, so an in-progress sale is never interrupted. IndexedDB is
 * untouched: pending offline sales survive the swap.
 */
export function applyAppUpdate(): void {
  const worker = waitingWorker;
  if (!worker) {
    window.location.reload();
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
}

function trackRegistration(registration: ServiceWorkerRegistration): void {
  const check = () => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting;
      emitUpdate();
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
  // Periodic check so a store left open for days still learns about updates.
  window.setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void registration.update().catch(() => {});
  });
}

/**
 * Registers the offline app-shell service worker. Refuses in dev, in the Lovable
 * editor preview, inside iframes, and when `?sw=off` is present — and cleans up
 * any stale registration in those cases.
 */
export function registerServiceWorker(): void {
  if (!supportsServiceWorker()) return;

  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const inIframe = window.self !== window.top;
  const refuse =
    !import.meta.env.PROD || inIframe || isPreviewHost(window.location.hostname) || killSwitch;

  if (refuse) {
    void unregisterAppWorker();
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => trackRegistration(registration))
      .catch(() => {
        /* offline app shell is best-effort */
      });
  });
}
