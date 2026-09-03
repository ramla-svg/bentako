# Fix the desktop Review sale button

## Goal

Make the Review sale panel open reliably in desktop Chrome while keeping its instant, animation-free behavior on mobile.

## Plan

1. Replace the fragile click path
   - Move the cart bar inside the Sheet component and wrap it with the Sheet’s native trigger.
   - Keep the panel controlled by `cartOpen` so Android back handling and checkout closing continue to work.
   - Give the trigger an explicit `type="button"` and preserve the current cart count and total display.

2. Keep the panel simple and immediate
   - Retain normal conditional portal mounting; do not restore `forceMount` or hidden mounted overlays.
   - Keep the existing animation-free Sheet styles and light backdrop.
   - Preserve memoized product tiles and deferred cart-draft saving.

3. Verify the real interaction
   - Desktop Chrome width: add one item, open Review sale, close it with its close button, backdrop, and Escape, then reopen it.
   - Repeat with several items and confirm the panel remains above the desktop shell and cart bar.
   - Check mobile width to ensure the same trigger still opens instantly.
   - Check for runtime and console errors during these actions.

## Technical scope

Only the POS cart trigger/panel wiring and, if verification exposes it, the Sheet stacking/portal presentation will change. Pricing, checkout, stock, receipts, offline storage, and sync behavior remain untouched.
