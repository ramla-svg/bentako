# Make the Review sale panel open instantly, every time

## Problem

Opening the cart panel with one item feels slow, while opening it after adding many items feels instant. The panel markup itself no longer animates, so the delay is in the *first* open: the panel is created from scratch the first time it is shown (portal mount, overlay paint, focus and scroll-lock work), and that first-time cost lands exactly on the one-item case. Once it has been opened once during the session, later opens reuse warm work and feel fast.

## Goal

Every open of "Review sale" behaves identically to the fast case: it appears immediately, with no fade, no slide, and no first-time delay.

## Changes

1. Keep the sale panel mounted instead of creating it on each open
   - Render the panel content permanently but hidden, so opening only flips visibility.
   - This removes the first-open cost entirely, so one item and ten items behave the same.

2. Remove remaining motion and heavy paint on the panel
   - Zero-duration open/close on the panel and its backdrop.
   - Lighter backdrop (no heavy full-screen dark repaint on a mid-range Android).

3. Reduce work on each product tap
   - Memoize the product tiles so tapping one item does not re-render the whole grid.
   - Defer the cart-draft save to local storage so it never blocks the tap or the panel open.

## Not included

No changes to pricing, stock, checkout, receipts, sync, or any other business logic. Purely presentation and rendering performance on the POS screen.

## Technical notes

- `src/components/ui/sheet.tsx`: use Radix `forceMount` on the portal/overlay/content for this usage and drive visibility with `data-state` styling; ensure no `animate-*`/transition classes remain and animation duration is 0.
- `src/routes/_authenticated/pos.tsx`: extract the product tile into a `React.memo` component with stable `onClick` handlers (`useCallback`), and move the cart-draft `localStorage` write into a deferred callback (`requestIdleCallback`/timeout) instead of a synchronous effect on every cart change.
- Verify in the preview at 360px: measure time from tap to panel visible for a 1-item cart and a 10-item cart and confirm they match.
