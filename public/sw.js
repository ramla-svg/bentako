/* BentaKo offline app-shell service worker.
 * Keeps the app openable with no internet so cashiers can keep selling.
 * Data itself lives in IndexedDB (Dexie); this only caches the shell + assets.
 */
const VERSION = "bentako-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const NAV_FALLBACK = "/__bentako_shell";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch("/pos", { credentials: "same-origin" });
        if (res.ok) await cache.put(NAV_FALLBACK, res.clone());
      } catch {
        /* offline install — nothing to prime */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never cache API / auth traffic — it must always hit the network.
  if (sameOrigin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn"))) {
    return;
  }

  // App shell navigations: network first, cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const res = await fetch(req);
          if (res.ok) {
            await cache.put(NAV_FALLBACK, res.clone());
            await cache.put(new Request(url.pathname, { credentials: "same-origin" }), res.clone());
          }
          return res;
        } catch {
          return (
            (await cache.match(url.pathname)) ??
            (await cache.match(NAV_FALLBACK)) ??
            new Response("<h1>BentaKo is offline</h1><p>Reopen once loaded online at least once.</p>", {
              status: 200,
              headers: { "content-type": "text/html; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Build output / static assets: cache first, then network.
  if (sameOrigin && isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res.clone());
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Google Fonts and other cross-origin styles: stale-while-revalidate.
  if (!sameOrigin && /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res.clone());
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
  }
});
