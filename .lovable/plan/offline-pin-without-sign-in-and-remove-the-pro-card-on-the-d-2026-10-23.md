# Offline PIN without sign-in, and remove the Pro card on the dashboard

## 1. PIN managed inside the app (no Google sign-in needed)
- **Turn on PIN:** works anytime, even offline. Enter the new PIN twice. You don't need to be online or signed in again.
- **Change PIN:** enter the current PIN, then the new PIN twice. Works offline.
- **Turn off PIN:** enter the current PIN. Works offline.
- **Forgot PIN on the lock screen:** it will no longer ask for Google. Instead it shows "Forgot PIN? Ask the store owner", and the Google option stays only as a backup when online. This is the only way to get back in without erasing records, so it stays available but isn't required.
- Unchanged: 5 wrong tries then a growing wait, PIN kept on this phone only and stored scrambled, never uploaded, and removed when you sign out.

## 2. Remove the "BentaKo Pro · ₱99 / buwan" card from the dashboard
- Free users no longer see the Pro card on the dashboard.
- They will still learn about Pro when they hit the 60-product limit, and in Settings where cloud saving is explained. The Upgrade page stays reachable from the menu.
- The renewal reminder for stores that already pay for Pro stays.

## Not changing
Prices, the 60-product limit, cloud saving rules (Free saves on the phone, Pro also saves to the cloud), sync, and records.

## Technical notes
- `pin-settings.tsx`: drop the `isOnline()`/`getSession()` check on first setup; current-PIN verification stays for change/turn-off.
- `pin-lock.tsx`: keep the Google reset path as an optional, online-only secondary link; nothing gates PIN usage on a session.
- `dashboard.tsx`: remove the `pro ? null : <Link to="/upgrade">…` block and the unused `Crown` import if no longer used.
- Update tests in `tests/offline-pin-and-batch.test.ts` (setting a PIN needs no session); run full vitest suite.
- Save memory: no Pro promo card on the dashboard; Pro is surfaced at limits and in Settings.
