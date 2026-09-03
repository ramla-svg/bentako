# Fix: "Review sale" panel does not open on desktop

## Problem

On desktop, tapping the cart bar no longer opens the Review sale panel. The most likely cause is the always-mounted panel change made for the mobile speed fix: the panel is now kept in the page at all times and hidden with a CSS rule, and its overlay is kept mounted too. When the panel is permanently mounted, the open/close state no longer reliably drives visibility, so on desktop the panel can stay hidden even after the state flips to open. This diagnosis is based on reading the current panel code; the first step of the work is to confirm it in the running app.

## Plan

1. Reproduce and confirm
   - Open the sale screen at desktop width, add one item, click the cart bar, and check whether the panel state flips and whether the panel element is still hidden.

2. Fix visibility (correctness first)
   - Stop keeping the panel permanently mounted, so the panel is shown and hidden by its normal open/close behavior on every screen size.
   - Keep the instant, no-animation feel: no fade, no slide, zero duration, light backdrop.

3. Keep the mobile speed work that is safe
   - Keep memoized product tiles and the deferred cart-draft save, since neither affects whether the panel opens.
   - If the first open still feels slower than later opens on mobile, warm it once quietly in the background rather than keeping it visible-but-hidden.

4. Verify
   - Desktop width: 1 item and several items both open the panel immediately; the close button, backdrop click, and Escape all close it.
   - 360px width: same behavior, opens immediately for 1 item and 10 items.

## Not included

No changes to pricing, stock, checkout, receipts, or sync.

## Technical notes

- `src/components/ui/sheet.tsx`: drop the conditional `forceMount` pass-through on portal/overlay/content and the `data-[state=closed]:hidden` workaround; keep the animation-free class list and `bg-black/50` overlay.
- `src/routes/_authenticated/pos.tsx`: remove `forceMount` from the Review sale `SheetContent`; leave the memoized `ProductTile` and idle-callback draft write untouched.
- Optional warm-up if needed: mount-once prefetch of the panel subtree without `forceMount` on the overlay, measured before keeping.
