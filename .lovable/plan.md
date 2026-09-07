# Bring back up-and-down scrolling (keep the sideways lock)

The last fix stopped the page from sliding sideways, but it also made the page too locked: on the phone the dashboard no longer scrolls up and down properly. The goal now is simple:

- Up and down: always works, smoothly, on every page.
- Sideways: still locked, so the header, bottom bar and content never drift left or right when you drag or tap.
- The top bar and the bottom buttons stay put while the middle scrolls.

## What changes

1. Replace the hard sideways lock with a softer one that does not interfere with vertical scrolling. The page keeps its full height and scrolls normally; only sideways movement is trimmed.
2. Remove the blanket "no bouncing" rule from the page body and keep it only where it is needed (the sideways chip rows), since that rule is what can freeze scrolling inside the wrapped Android app.
3. Keep the touch rule that says "drag up and down only" on the app frame, and make sure nothing above it cancels it.
4. Keep the top header sticky and the bottom navigation fixed, with the middle area free to scroll behind them.
5. Check the result at phone, large phone and tablet widths on the dashboard, POS, products and sales pages: scrolling reaches the bottom of the content, nothing is hidden behind the bottom bar, and there is still no sideways drift.

## Technical notes

- `src/styles.css`: on `html`/`body` swap `overflow-x: hidden` for `overflow-x: clip` (does not create a scroll container that can trap vertical scroll in Android WebView), drop `overscroll-behavior: none` from `body` (keep `overscroll-behavior-x: none`), keep `width/max-width: 100%`.
- Keep the `app-pan-y` (`touch-action: pan-y`) and `scroll-rail` utilities as they are.
- `src/components/app-shell.tsx`: keep `min-h-screen`, sticky header, fixed bottom nav; replace the inner `overflow-x-hidden` wrappers with `overflow-x-clip` so no nested scroll container is created.
- Verify with Playwright at 360/390/430/768 px: `scrollHeight > clientHeight`, programmatic scroll to bottom lands at the end, and `document.documentElement.scrollWidth === clientWidth`.
