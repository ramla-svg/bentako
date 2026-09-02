// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        // "prompt": a new build waits until the user taps "Update when ready",
        // so a deployment can never interrupt an in-progress sale.
        registerType: "prompt",
        filename: "sw.js",
        injectRegister: null,
        devOptions: { enabled: false },
        manifest: false, // public/manifest.webmanifest is maintained by hand
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          // Client assets are emitted under dist/client but served from the
          // root, so precache URLs must be rewritten or install 404s.
          modifyURLPrefix: { "client/": "/" },
          // TanStack Start renders HTML on the server, so explicitly fetch the
          // root shell during worker installation and use it for uncached route
          // navigations. The client router then renders from locally-cached data.
          additionalManifestEntries: [{ url: "/", revision: null }],
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\/callback/],
          skipWaiting: false,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // App shell / HTML navigations: always try the network first so a
              // new deployment is picked up immediately.
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "bentako-pages",
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true,
                },
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
    ],
  },
});
