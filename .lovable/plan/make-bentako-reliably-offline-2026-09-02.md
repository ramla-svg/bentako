# Make BentaKo Reliably Offline

## Goal

BentaKo should reopen without internet on a device that has already signed in and loaded the store once, save every operational change locally, and upload pending records automatically when connectivity returns.

## Plan

1. **Harden the offline app shell**
   - Keep service workers disabled in the editor preview, but make the published/installed app explicitly cache a usable BentaKo startup route and required built assets after the first successful online launch.
   - Keep navigation network-first while online, with a cached app-shell fallback when the network is unavailable.
   - Exclude authentication, OAuth, API, and server-function requests from caching.
   - Show a clear first-use message if offline mode has not yet been prepared on that device.

2. **Make cached sign-in startup deterministic**
   - Read the local session/store snapshot before waiting on any network authentication call.
   - If a valid local store snapshot exists, enter the app immediately and refresh authentication/profile data in the background when online.
   - Never redirect an established device to sign-in or onboarding only because an online check timed out or the connection is unavailable.
   - Keep online sign-in required for the first setup on a device and after an explicit sign-out.

3. **Guarantee local-first operational writes**
   - Keep sales, products, stock movements, expenses, voids, and audit records in IndexedDB first.
   - Make each business operation and its sync-queue entries commit atomically, so a tab/app interruption cannot leave saved data without upload intent.
   - Preserve UUID-based idempotent uploads and grouped sale synchronization to prevent duplicates.
   - Keep store/account settings that currently require the cloud clearly disabled offline rather than pretending they were saved.

4. **Improve reconnect and status behavior**
   - On reconnect, validate actual reachability, then drain pending records and pull newer cloud records without overwriting unsynced local work.
   - Keep failed records visible as retrying, provide manual retry, and only show “Synced” after the durable queue is empty.
   - Ensure authentication refresh failures do not discard locally queued records.

5. **Verify the real offline lifecycle**
   - Test on a production-style build rather than the editor preview, because preview intentionally unregisters app-shell service workers.
   - Online first launch/sign-in → confirm offline-ready state → close app → disable network → reopen directly to POS.
   - Offline: complete sales, add/edit a product, stock in/adjust, add an expense, reload/restart, and confirm all records and stock remain correct.
   - Reconnect: confirm one upload per UUID, queue drains, cloud/local totals match, and no duplicate receipts, sales, items, or movements exist.
   - Test update availability with pending records to confirm applying an update preserves IndexedDB and the queue.

## Technical notes

- Continue using Dexie/IndexedDB as the operational source of truth and Lovable Cloud as the synchronized backup.
- Continue using `vite-plugin-pwa` generated Workbox service worker; do not add a handwritten worker.
- Offline mode is available only after one successful online setup on that browser/device. Clearing site data, private browsing, or explicit sign-out removes the local access needed for offline startup.
