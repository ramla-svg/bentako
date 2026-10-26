# One store per email, and honest store counts in Owner Tools

## What is happening now

Owner Tools counts store records, not people. Right now there are 7 store records but only 3 emails:

- ayisha.janna.almar@gmail.com owns **5** stores
- iam.almarue@gmail.com owns 1
- masbatemetro99@gmail.com owns 1

Your 5 stores were made like this:

| Store | Made | Plan | Products | Sales | Phone linked to it |
|---|---|---|---|---|---|
| EVARDONE STORE | Sep 2 | Free | 9 | 5 | no |
| Ayisha Evardone | Sep 4, 11:07:57 | Free | 0 | 0 | no |
| Ayisha Evardone | Sep 4, 11:07:59 | Free | 0 | 0 | no |
| Ayisha Evardone | Sep 4, 11:08:03 | Free | 0 | 0 | no |
| Ayisha Evardone | Sep 4, 11:08:13 | Pro | 18 | 33 | yes (the one you use) |

The four "Ayisha Evardone" stores were made within 16 seconds of each other. That means the "Finish" button on the first-setup screen was tapped several times, or the setup was retried after a slow reply, and each tap made a new store. Nothing stops one email from making a second store.

## The fix

1. **One email = one store, enforced by the system.** If the same account tries to set up a store again (double tap, retry, or going back to setup), BentaKo opens the store it already has instead of making a new one. The database will also refuse a second store for the same owner, so even a fast double tap cannot get through.
2. **Setup button can only fire once.** While setup is running, the Finish button is locked.
3. **Owner Tools counts people, not records.** Stats become: **Total owners** (unique emails), Pro, Free, Expired. Each owner counts once, using their active store (the one their phone is linked to, otherwise the newest one with sales). The other stores are still in the list but marked "Duplicate (unused)" and left out of the totals.
4. **Your 4 extra stores.** The database can't add the "one store per owner" rule while those duplicates exist. I will **not delete anything.** Instead, the three empty ones and the old EVARDONE STORE (9 products, 5 sales) get marked as "retired duplicate". They stay saved, are skipped by the rule and the stats, and can still be viewed. Payment history is untouched.

**Question for you:** do you want EVARDONE STORE's 9 products and 5 sales kept as a separate retired store (default), or moved into your active Pro store?

## What stays the same

Prices, Free/Pro limits, the PIN, Google sign-in, offline saving, receipts, and every sale and payment record.

## Technical details

- Migration (additive): `stores.retired_at timestamptz NULL`, plus a partial unique index `stores(owner_id) WHERE retired_at IS NULL`. Marking the 4 duplicates retired is a data update run separately before the index is created.
- `onboarding.tsx`: before inserting, look up an existing non-retired store for `uid`; reuse it. Handle unique-violation (23505) by loading the existing store. Guard `finish()` against re-entry.
- `admin-subscriptions.ts`: `computeAdminMetrics` / `buildStoreList` group by `owner_id`, exclude `retired_at` rows from counts, add a `duplicate` flag; panel label "Total owners".
- Tests: same email with 5 stores counts as 1 owner; retired store excluded from Free count; onboarding retry returns the existing store id instead of creating one.
