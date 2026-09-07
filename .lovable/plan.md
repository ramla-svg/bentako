# Fix: black/white screen after signing out and signing in again

## What is actually happening (confirmed on the live app)

BentaKo keeps an offline copy of itself on each phone. Inspecting the live
copy's offline worker shows two problems that together cause the blank screen:

1. The home page (`/`) was stored in the offline copy **once, on the very first
   install, and never refreshed again** — not even when a new version of the app
   was installed. So every phone still boots the home page from the day BentaKo
   was first opened on it.
2. The offline worker was set up to serve that stored home page for **every**
   page load (dashboard, POS, and so on) before even trying the internet. The
   "always try the internet first" rule that exists in the config is listed
   after it, so it never runs.

That old home page points at app files that no longer exist. For a while the
phone also still had those old files stored, which is why the app "worked" but
never showed new features. Once those old files were cleared out, any full page
load shows nothing at all — white on a light phone, black on a dark one. The
"Starting BentaKo…" safety panel from the last fix never appears because the
stored old page predates it.

Signing in again with Google is exactly a full page load: Google sends you back
to the home page, the sign-in itself succeeds (the logs show it), but the page
that receives you is the dead old copy. The sign-in screen itself still works
only because it was the one address excluded from the stored copy.

Reproduced the flow with a fresh install of the live app: it works, because a
fresh install has a fresh home page — the bug only affects phones that installed
BentaKo before the latest version, which is every real user.

## The fix

1. Store the home page **keyed to the build**, so every new version replaces it
   and the old one is deleted automatically.
2. Remove the "serve the stored page for every navigation" rule. Page loads go to
   the internet first, fall back to a short-lived recent copy on a flaky
   connection, and use the current build's stored home page only when fully
   offline. Offline use keeps working.
3. Always fetch the worker script fresh so a new version is noticed on the next
   open.

## What users will see after this is published

Phones already stuck on the dead copy will pick up the new worker the next time
they open the app, and it takes over after the app is **fully closed and
reopened once** (swipe it away, or close the tab). From then on updates and
sign-in work normally. No data on the phone is touched.

## Technical notes

- `vite.config.ts` (Workbox): hoist a `BUILD_ID` const (reused by the existing
  `define`); `additionalManifestEntries: [{ url: "/", revision: BUILD_ID }]`;
  drop `navigateFallback` / `navigateFallbackDenylist` (no `NavigationRoute`);
  navigation `NetworkFirst` rule gets `cacheName: "bentako-pages-v2"`,
  `maxEntries: 20`, `maxAgeSeconds: 1 day`, and
  `precacheFallback: { fallbackURL: "/" }` for the offline case.
- `src/lib/register-sw.ts`: `register(SW_URL, { scope: "/", updateViaCache: "none" })`.
- Verification: production build, then confirm the generated `sw.js` has no
  `NavigationRoute`, contains `{url:"/",revision:"<build>"}`, and the navigate
  rule uses `PrecacheFallbackPlugin`; re-run the sign-out → Google-return
  simulation.
