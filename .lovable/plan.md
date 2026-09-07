# Lock the screen down + make the wrapped APK pick up new versions

## 1. Stop the screen from shifting when you drag

Right now the page can be dragged sideways and the whole screen (header, bottom bar) slides with it. The fix:

- Prevent any sideways scrolling or rubber-band drag on the page itself. Sideways scrolling stays allowed only inside the small filter-chip rows that are meant to scroll (POS, Cash ledger, Payments).
- Make the top header and bottom bar truly pinned, so they never move while the list behind them scrolls.
- Remove the leftover causes of sideways overflow: rows that use negative side margins, long product/customer names that can't wrap, and wide number columns.
- Vertical scrolling of content keeps working exactly as now.

## 2. Fit every phone and tablet automatically

- One fluid layout that adapts by available width instead of fixed sizes: content keeps comfortable side spacing on small phones, gets wider columns on big phones, and switches to a two/three-column grid on tablets.
- Cards, tiles and dialogs never exceed the screen width; text truncates or wraps instead of pushing the page wide.
- Titles and totals scale slightly with screen width so nothing overlaps on a 320px-wide phone or looks tiny on a 10" tablet.
- Buttons keep a comfortable minimum tap size on every screen.
- I will check the app at 320, 360, 390, 430, 768, 820 and 1024 px wide, in both orientations, and screenshot the Dashboard and POS to confirm nothing shifts.

## 3. Why the wrapped APK doesn't show new features — and the fix

Your APK loads the same web address, so in principle it should always show the newest version. In practice three things keep it on the old copy:

1. BentaKo installs an offline copy of itself so it can sell without internet. Once installed, that saved copy is what opens first. A new version is downloaded in the background but only swapped in when someone taps "Update when ready" — and that small notice is easy to miss inside a wrapper app.
2. The Android browser engine inside the wrapper also keeps its own saved copy of the page and often reuses it without asking the server.
3. A wrapper app never fully closes, so it can go weeks without a fresh start where the swap would happen.

The fix:

- Add a tiny version marker to each published build. On open, and whenever the app comes back to the foreground, BentaKo compares the marker with the server. If a newer build exists, it switches to it immediately and refreshes — unless a sale is in progress, in which case it waits until checkout finishes, then updates.
- Keep the visible "Update available" notice as a manual fallback, made more obvious.
- Tell the Android engine never to reuse a stale copy of the main page, so the version check always reaches the server.
- Add a "Check for updates" button in Settings showing the installed version, so you can force it on any device.
- Saved products, stock, sales and the pending-sync queue are untouched by an update.

If your wrapper tool has its own caching or "offline mode" setting, I will note in Settings which one to turn off; that part lives in the wrapper, not in the app.

## Technical notes

- `src/styles.css`: `html, body { overflow-x: hidden; overscroll-behavior: none; width: 100% }`, `touch-action: pan-y` on the app container, keep `pan-x` on the chip rails; add fluid `clamp()` sizes and container-based breakpoints.
- `src/components/app-shell.tsx`: header/bottom nav already `fixed`/`sticky` — pin with proper `z-index`, remove `-mx-4` overflow rows, add `max-w-full min-w-0` guards; grid columns keyed to `sm/md/lg`.
- New `public/version.json` (or build-stamped constant) + `src/lib/register-sw.ts`: version poll on `visibilitychange` and interval; auto-call `applyAppUpdate()` when no active cart/checkout, deferred otherwise via a small "update pending" flag.
- Service worker: keep NetworkFirst for navigations, ensure `Cache-Control: no-store` semantics for `/` and `version.json` (bypass Workbox cache for the version file).
- `src/routes/_authenticated/settings.tsx`: version + "Check for updates" card.
