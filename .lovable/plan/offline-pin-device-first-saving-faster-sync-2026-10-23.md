# Offline PIN, device-first saving, faster sync

## What you will get

1. **Offline PIN lock (works with no internet)**
   - The owner sets a 4-digit PIN in Settings while online and signed in with Google (one-time per phone).
   - When BentaKo opens, or comes back after being in the background for a few minutes, it asks for the PIN before showing the store. This works fully offline.
   - Wrong PIN 5 times: a growing wait before the next try. "Forgot PIN" asks for Google sign-in again (needs internet) and then lets you set a new PIN. Sales and records are never erased.
   - The PIN stays on that phone only, stored scrambled (never as plain digits) and never uploaded. Signing out removes it.
   - Owner can turn the PIN on, off, or change it in Settings.

2. **Where records are saved**
   - Every sale, product, stock change, expense, cash entry, customer and utang payment saves to the phone first, every time, on Free and Pro.
   - Free: records stay only on this phone. Nothing is uploaded. Settings says so clearly.
   - Pro: the same records are also backed up to the cloud automatically.
   - Photos and activity logs stay on the phone for both plans (as today).

3. **Faster syncing (Pro)**
   - Upload starts a moment after each save instead of waiting for the next scheduled check.
   - Records are sent in groups per type instead of one at a time, keeping sales and their items together and in the right order.
   - Retries after reconnecting start right away; the sync badge updates as soon as the queue is empty.

## Not changing

Prices, Free/Pro limits, Google sign-in, offline opening of the app, receipts and printing, existing records.

## Technical notes

- New `src/lib/offline-pin.ts`: PBKDF2-SHA256 with random salt, stored in Dexie `settings` keyed by userId + storeId; serialized verification; attempt counter with exponential backoff persisted locally.
- New `src/components/pin-lock.tsx`: full-screen lock rendered by the authenticated layout only when status is `ready` and a PIN exists; relocks on `visibilitychange` after an idle timeout and on cold start. Does not alter AppSessionProvider root navigation.
- Setting/resetting the PIN requires a live session with recent Google authentication (checked client-side against the session; no server change needed). `signOut()` deletes the PIN record alongside the session snapshot.
- Sync: in `sync-service.ts` add a short debounce trigger from `enqueue`, batch `upsert` arrays per entity in `ENTITY_ORDER` (chunks of ~200), keep group/dependency ordering, attempt tokens and UUID idempotency. Free remains backup-disabled (queue not uploaded).
- Tests: PIN hash/verify, backoff, wipe on sign-out, account isolation; batched upload count, debounce trigger, Free uploads nothing. Run full vitest suite.
- Update memory: replace the "PIN cancelled" rule with the approved PIN design.
