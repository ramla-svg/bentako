// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// The Android (Capacitor) build sets BENTAKO_APK=1 so TanStack Start prerenders
// static HTML shells. Those shells are what gets bundled inside the APK, so the
// app can boot with zero network. The normal web build is untouched.
const APK = process.env["BENTAKO_APK"] === "1";

// One id per build. Stamped into the HTML (<meta name="bentako-build">) and used
// as the precache revision of the app shell so every deployment refreshes it.
const BUILD_ID = process.env["BENTAKO_BUILD_ID"] ?? new Date().toISOString();

const APK_PAGES = [
  "/",
  "/auth",
  "/onboarding",
  "/dashboard",
  "/pos",
  "/products",
  "/inventory",
  "/sales",
  "/expenses",
  "/reports",
  "/settings",
  "/more",
].map((path) => ({ path }));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(APK
      ? {
          prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: true },
          pages: APK_PAGES,
        }
      : {}),
  },

  vite: {
    // Stamped into every build and echoed in the HTML as <meta name="bentako-build">.
    // A running copy (browser, installed PWA, or link-wrapped APK) compares this
    // with the server's value and updates itself when they differ.
    define: {
      __BENTAKO_BUILD__: JSON.stringify(BUILD_ID),
    },
    plugins: [
      // The APK ships its own offline bundle inside the app, so no service
      // worker is generated for it (Capacitor does not use one anyway).
      ...(APK
        ? []
        : [
            VitePWA({
              strategies: "generateSW",
              // "prompt": a new build waits until the user taps "Update when ready",
              // so a deployment can never interrupt an in-progress sale.
              registerType: "prompt",
              filename: "sw.js",
              // sw.js must sit next to the served client assets, otherwise
              // /sw.js 404s and the PWA never installs.
              outDir: "dist/client",
              injectRegister: null,
              devOptions: { enabled: false },
              manifest: false, // public/manifest.webmanifest is maintained by hand

              workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
                // Client assets are emitted under dist/client but served from the
                // root, so precache URLs must be rewritten or install 404s.
                modifyURLPrefix: { "client/": "/" },
                // TanStack Start renders HTML on the server, so the root shell is
                // precached explicitly and used when a navigation cannot reach the
                // network. It is keyed by BUILD_ID: a `revision: null` entry is fetched
                // once and then kept forever — even across worker updates — which left
                // devices booting a stale shell whose scripts no longer existed
                // (a blank white/black screen after any full page load, such as the
                // return from Google sign-in).
                additionalManifestEntries: [{ url: "/", revision: BUILD_ID }],
                // No NavigationRoute on purpose: it would be matched before the
                // NetworkFirst rule below and serve the precached shell for every
                // navigation, so a deployment would never be picked up online.
                navigateFallback: undefined,
                skipWaiting: false,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                  {
                    // HTML navigations: network first so a new deployment is picked up
                    // immediately; a short-lived copy for flaky connections; and the
                    // current build's precached shell when fully offline.
                    urlPattern: ({ request }) => request.mode === "navigate",
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "bentako-pages-v2",
                      networkTimeoutSeconds: 4,
                      expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24,
                        purgeOnQuotaError: true,
                      },
                      precacheFallback: { fallbackURL: "/" },
                    },
                  },
                  {
                    urlPattern: ({ url, request, sameOrigin }) =>
                      !!sameOrigin &&
                      !url.pathname.startsWith("/api/") &&
                      ["style", "script", "worker", "font", "image"].includes(request.destination),
                    handler: "StaleWhileRevalidate",
                    options: {
                      cacheName: "bentako-assets",
                      expiration: { maxEntries: 200, purgeOnQuotaError: true },
                    },
                  },
                  {
                    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
                    handler: "CacheFirst",
                    options: {
                      cacheName: "bentako-fonts",
                      expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                ],
              },
            }),
          ]),
    ],
  },
});
