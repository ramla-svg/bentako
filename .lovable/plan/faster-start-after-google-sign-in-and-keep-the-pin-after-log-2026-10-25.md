# Faster start after Google sign-in, and keep the PIN after logging in again

## What is wrong
1. **Slow start (about 5 minutes):** right after Google sign-in, the app re-checks the account from inside the sign-in notice. That can make sign-in wait on itself until several time limits run out. Two account checks can also run at once.
2. **PIN asked to be recreated:** logging out erases every PIN saved on the phone. The next login then shows "Create a PIN" again.

## Fixes
- Run the account check just after the sign-in notice, not inside it. Let a second check reuse the one already running.
- Wait to download cloud records until the dashboard is showing, so the PIN screen appears first.
- The PIN screen reads the PIN from the phone straight away. It shows a spinner instead of a blank screen while it loads.
- **Keep the PIN when logging out.** Logging back in with the same Google account on the same store asks for the existing PIN, not a new one.
- A new PIN is only asked for: the first time on a phone, for a different account or store, or after "Forgot PIN, reset with Google".

## Not changing
Prices, Free/Pro limits, the PIN rules (4 digits, lockout), the Google account chooser, where records are saved, and receipts.

## Technical details
- `use-app-session.tsx`: in `onAuthStateChange`, defer `load()` with `setTimeout(0)`. Add an in-flight promise so concurrent `load()` calls share one run. Remove `clearAllPins()` from `signOut` (the PINs stay keyed `pin:${userId}:${storeId}`, so other accounts never use them). Defer `pullAll` to `requestIdleCallback`/after first render.
- `pin-lock.tsx`: call `getSession` only when `RESET_KEY` is set. Show a spinner while `locked === null`.
- Tests: concurrent `load` runs only once, and the PIN still exists after sign-out then sign-in. Run the full suite plus Playwright timing of the startup steps before and after the change.
