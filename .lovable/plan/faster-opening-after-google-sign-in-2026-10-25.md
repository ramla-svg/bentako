# Faster opening after Google sign-in

## What you will get
- After picking your Google account, BentaKo shows the PIN screen (or "Create a PIN") within a few seconds instead of minutes.
- No more blank white screen while it gets ready: a small loading spinner shows instead.
- Offline opening, the PIN, and your saved records work the same as before.

## Steps
1. **Measure first.** Sign in with Google in the preview and time each startup step, to confirm where the wait happens before changing anything.
2. **Likely cause to confirm:** right after Google sign-in, the app restarts its account check from inside the sign-in notice. That can make the sign-in system wait on itself until several time limits run out, and two account checks can run at the same time.
3. **Fixes:**
   - Run the account check just after the sign-in notice instead of inside it, and run only one check at a time (a second request reuses the one already running).
   - Have the PIN screen read the PIN from the phone straight away. Only check Google again when a "Forgot PIN" reset is waiting.
   - Start the cloud backup download for Pro after the PIN screen shows, so it doesn't hold up opening.
   - Show a spinner instead of a blank screen while the PIN screen loads.
4. **Verify:** time the sign-in again in the preview, run all tests, and add a test confirming that two account checks at once don't both run.

## Not changing
Prices, Free/Pro limits, PIN rules, Google account chooser, where records are saved, and receipts.

## Technical notes
- `use-app-session.tsx`: in `onAuthStateChange`, defer `load()` with `setTimeout(0)` (calling Supabase inside the callback can deadlock the auth lock). Add in-flight dedupe for `load`. Delay `pullAll` until after first render or idle time.
- `pin-lock.tsx`: call `supabase.auth.getSession` (time-limited) only when `RESET_KEY` is set. Render a loader when `locked === null`.
