/**
 * Build marker. Replaced at build time by vite `define` (see vite.config.ts),
 * so every published build gets a different value. The value is also written
 * into the served HTML as <meta name="bentako-build">, which lets a running
 * copy (including one inside a wrapped Android APK) ask the server whether a
 * newer build exists without trusting any browser cache.
 */
declare const __BENTAKO_BUILD__: string | undefined;

export const BUILD_ID: string =
  typeof __BENTAKO_BUILD__ === "string" && __BENTAKO_BUILD__ ? __BENTAKO_BUILD__ : "dev";

export const BUILD_META_NAME = "bentako-build";

/** Reads the build marker of the copy currently running in this tab. */
export function runningBuildId(): string {
  if (typeof document === "undefined") return BUILD_ID;
  const meta = document.querySelector(`meta[name="${BUILD_META_NAME}"]`);
  return meta?.getAttribute("content") || BUILD_ID;
}

/**
 * Asks the server for the build marker of the newest published copy.
 * Uses `cache: "no-store"` plus a cache-busting query so the Android WebView
 * inside a wrapper app cannot answer from its own saved page.
 */
export async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/?_bk=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(
      /<meta[^>]+name=["']bentako-build["'][^>]+content=["']([^"']+)["']/i,
    ) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']bentako-build["']/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
