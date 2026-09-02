/** Registers the offline app-shell service worker (browser only, production + preview). */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Vite dev server serves its own module graph; a SW would cache dev chunks.
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* offline app shell is best-effort */
    });
  });
}
