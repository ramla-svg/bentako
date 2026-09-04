/**
 * Single source of truth for connectivity. The sync engine and UI subscribe
 * here instead of touching `navigator.onLine` directly, so a future Capacitor
 * Network plugin can be wired in by replacing this module's internals only.
 */

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();

/**
 * Capacitor Network status, when the native bridge supplies it. On Android the
 * WebView's `navigator.onLine` is unreliable, so the native value wins.
 */
let nativeOnline: boolean | null = null;

export function isOnline(): boolean {
  if (nativeOnline !== null) return nativeOnline;
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/** Called by the Capacitor bridge only. Web/PWA never touches this. */
export function setNativeOnline(online: boolean): void {
  if (nativeOnline === online) return;
  nativeOnline = online;
  notify();
}

function notify(): void {
  const online = isOnline();
  for (const fn of listeners) {
    try {
      fn(online);
    } catch {
      /* a bad listener must never break connectivity handling */
    }
  }
}

let bound = false;

function bind(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribeNetwork(fn: Listener): () => void {
  bind();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Best-effort reachability probe. `online` only means "has a link", so the sync
 * engine can use this before deciding a failure is permanent.
 */
export async function probeReachable(url = "/favicon.png", timeoutMs = 4000): Promise<boolean> {
  if (!isOnline()) return false;
  if (typeof fetch === "undefined") return isOnline();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${url}?ping=${Date.now()}`, { method: "HEAD", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
