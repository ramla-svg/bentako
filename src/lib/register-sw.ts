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

/**
 * Registers the offline app-shell service worker. Refuses in dev, in the Lovable
 * editor preview, inside iframes, and when `?sw=off` is present — and cleans up
 * any stale registration in those cases.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const inIframe = window.self !== window.top;
  const refuse =
    !import.meta.env.PROD || inIframe || isPreviewHost(window.location.hostname) || killSwitch;

  if (refuse) {
    void unregisterAppWorker();
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
      /* offline app shell is best-effort */
    });
  });
}
