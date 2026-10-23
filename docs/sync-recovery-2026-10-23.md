# Sync recovery — 23 October 2026

## Scope

Sync only. The user cancelled the subsequently approved offline PIN phase; all three unfinished, unreferenced PIN files were removed before UI integration. Google sign-in and cached offline entry remain unchanged. No publishing, business-record deletion, entitlement changes, migrations, or production writes.

## Confirmed issues and corrections

- Regression tests reproduced missing expiry refresh, auth failures becoming failed records, and successful timestamps advancing after rejected uploads.
- Manual retry now bypasses record backoff and retries uploads plus cloud reads. A valid session is not rotated merely because Retry was tapped; near-expiry sessions and confirmed JWT failures refresh, with one replay per pass.
- Auth/transport failures preserve pending intent and local records. Permissions and data rejections remain visible failures; permissions are not mislabelled as expired sign-in.
- One bounded upload pass and one bounded cloud pull are shared. Timeout/interruption releases the request, retains UUID intent and attempt-token race protection, and permits retry. Existing interrupted `syncing` rows replay naturally; no blanket queue purges.
- Resolved session/store/plan scope owns sync. Free starts with backup disabled and displays device-only storage. Other stores' queue records are retained but not uploaded or counted for the active store.
- Dependency order applies across groups; a backed-off group cannot upload remaining dependent members until retry. Separate cloud requests are **not** claimed to be transactionally atomic.
- Local pull merges recheck pending intent inside the local transaction, protecting edits that arrive while the cloud read is in flight.
- Preview telemetry contained a 401 on the unauthenticated `/auth/v1/health` probe. Reconnect uses the app's static transport probe instead; authentication is checked separately. This 401 was not proven to be the user's original queued-record rejection.
- Settings has a visible Retry sync state, friendly failure status, and Google reconnection when sign-in is missing/expired. Reconnection never signs out or clears local records.

## Verification

- Initially reproduced three regression failures before implementing fixes.
- After PIN cancellation and removal: all 155 tests in 14 files passed; changed-file lint had no errors, and the latest automatic preview build was OK.
- Targeted and full Vitest runs cover authentication, permission failures, manual backoff bypass, UUID replay, interrupted attempts, hung uploads, concurrent calls, active-store switching, Free preservation, pull failure, edits during pull, and dependency/group order.
- Changed-file ESLint: no errors; existing mixed-export Fast Refresh warnings on session/connection files remain.
- Automatic preview diagnostics: build OK. No manual production build/typecheck or publication was run.
- All content routes, including index and Settings, retain their individual BentaKo titles, descriptions and social metadata.
- Signed in as the requesting user's own account in a fresh local browser. Account/profile/store reads were real; all cloud writes and unrelated server mutations were blocked. Operational cloud reads/uploads used isolated browser responses.
- UI flow: browser offline → add product (cost 10, price 15, stock 10) → zero upload attempts while offline → reconnect/reload with local record retained → injected rejection visible (2 intents, 1 failure) → tap Retry sync → product and initial-stock intent drain (0 waiting, 0 failures) → product reads back with stock 10 and synced status.
- Checked desktop 1280×1800 and the user's 506×674 viewport; sync text fits, no sideways overflow, no page errors.

## Limits

The user's device-local failed queue is not available inside the sandbox, so its exact original rejection could not be read. Successful writes to the real cloud were deliberately not tested; no live business records were changed. Physical Android/AppMint, real Google OAuth interaction, cross-device synchronization, and installed offline app-shell reopening remain unverified.