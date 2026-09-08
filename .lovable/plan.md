# What BentaKo costs to run, and keeping the phone's own storage doing the work

## The bill, in plain terms

There is no charge from Google for the app itself once it is on the Play Store — a Play Console account is a one-time 25 USD, and BentaKo takes no payments in-app, so there is no revenue share.

The only ongoing cost is BentaKo's own backend, which does three things:

1. **Sign-in** — every phone must reach the internet once to sign in with Google. This is free at BentaKo's size and cannot be moved onto the phone.
2. **Backup of records** — sales, items, stock movements, products, expenses, cash entries, customers and utang payments are copied to the cloud so a lost or wiped phone can be recovered. Text rows like these are tiny; a busy store makes a few megabytes a year.
3. **Activity logs** — a separate running list of every action taken in the app (every sale, every edit, every void). This is by far the biggest and fastest-growing set of rows, and no screen in BentaKo reads it from the cloud.

GCash screenshots are already kept on the phone only and never uploaded, so they cost nothing. That stays exactly as it is, with the Save/Share button so you can copy a photo out before changing phones.

## The change

Activity logs stop leaving the phone. They keep being written on the device exactly as now, so the owner's integrity check and any future on-phone history still work — they simply stop being uploaded, which removes the largest and least useful part of the cloud bill.

Anything already waiting to upload from the logs is cleared out quietly on the next app start. Sales, products, cash entries, customers and utang stay backed up as they are now, so recovery on a new phone is unaffected.

Nothing you see changes: same screens, same records, same offline behaviour, same sign-in.

## Technical notes

- `src/lib/repo.ts` (`writeAudit`, around line 49): keep `db().audit_logs.put(row)`, drop the `enqueue("audit_logs", row.id)` call. Every caller and the local table stay as they are.
- `src/lib/sync-service.ts`: remove `"audit_logs"` from `ENTITY_ORDER` so it is neither pushed nor pulled. Keep `"audit_logs"` in the `SyncEntity` union so existing queue rows still type-check while they are drained/cleared.
- One-time cleanup: on sync service init, `db().sync_queue.where("entity").equals("audit_logs").delete()` so old pending log rows do not sit in the queue forever and the "pending" badge clears.
- `src/routes/_authenticated/settings.tsx`: add one line under the sync card stating activity logs are kept on this phone only, alongside the existing note about receipt photos.
- No schema change and no migration: `public.audit_logs` stays in place (existing rows are harmless) and nothing new is written to it.
- Verify: record a sale offline and online, confirm the queue drains to zero, the log row still appears locally, and the owner integrity check still passes; then run the typecheck.
