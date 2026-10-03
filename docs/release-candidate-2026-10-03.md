# BentaKo release candidate — RC 2026-10-03

No release version convention exists in the repository (`package.json` has no `version`; Android is `versionName "1.0"`, `versionCode 1`, unchanged). This build is labelled **RC 2026-10-03**. Pricing, plan entitlements, schema and production data were not changed. Nothing was published.

## Confirmed findings and fixes

| # | Finding (confirmed in code) | Path | Fix |
|---|---|---|---|
| 1 | `voidSale` marked the sale voided, then updated customer, each product, movement and queue in separate writes. A repeated/concurrent tap or crash could restore stock/utang twice or partially. No store scoping. | `src/lib/repo.ts` | Single Dexie transaction under critical-work protection. Status is re-checked inside the transaction; sale, customer and products must belong to the caller's store. Stock and utang restored once; all changes + audit + queue entries commit together in one sync group. Returns `true` only when it actually voided. |
| 2 | `saveCashTransaction` claimed atomicity but wrote row, photo, queue and audit separately. `service_fee` used `Number(...) \|\| 0`, accepting negative/Infinity. | `src/lib/repo.ts` | One transaction for row/photo/queue/audit. Amount must be finite and > 0; fee finite and >= 0. |
| 3 | `writeCustomerLedger` wrote a payment and queued an update for a missing or other-store customer; audit was outside the transaction. | `src/lib/repo.ts` | Customer existence and store checked inside the transaction before any write; audit included in the commit. |
| 4 | `checkout` accepted negative/zero/NaN/Infinity quantities and prices, negative discount, nonfinite cash, duplicate product lines; deducted stock from other-store products; silently skipped a missing/other-store utang customer while still saving an utang sale. | `src/lib/repo.ts` | Input validation before writing; other-store product or missing/other-store utang customer aborts the whole transaction (rollback). The POS cart is keyed by product so duplicates never occur in normal use. |
| 5 | **Sync race:** `syncNow` uploaded a row, then unconditionally marked it synced and deleted its queue item. An edit re-queued during the upload was lost and the newer local row was marked synced. | `src/lib/sync-service.ts` | Each attempt stamps the queue item; `finishUpload` (transactional) only marks synced/deletes if the stamp is unchanged. Failure paths also skip when a newer intent exists. |
| 6 | Analogous issues in other mutations: `stockIn`, `adjustStock`, `archiveProduct`, `restoreProduct` non-atomic and not store-scoped; `saveProduct` could rewrite another store's product id into this store. | `src/lib/repo.ts` | Made atomic, store-scoped, with finite positive quantity checks. `saveProduct` rejects other-store ids. |

Not changed (audited, lower priority): `saveProduct`/`saveExpense`/`saveCategory`/`ensureDefaultCategories` still write row, queue and audit in separate steps (no money/stock double-apply risk; a crash leaves a row with `sync_status: "pending"` that is re-queued on next edit only). `nextTransactionNumber` runs outside the checkout transaction (display number only; UUID is identity).

## Tests

New: `vitest.config.ts`, `tests/setup.ts`, `tests/helpers.ts`, `tests/repo.test.ts`, `tests/sync.test.ts`; script `npm test` (`vitest run`). Tests use `fake-indexeddb` and fixture stores `store-test-a`/`store-test-b`; the backend client and network are mocked — no production records are touched.

Coverage: repeated and concurrent void, rollback on other-store product, stock and utang restore, invalid/nonfinite values, wrong-store and missing customers, cash atomicity incl. rollback when photo write fails, checkout negative/nonfinite/duplicate inputs, sync upload race.

Evidence: against the original code (commit `c628bfb`) 21 of 30 tests fail (20 repo + the sync race); with the fixes all 30 pass.

## Command results

| Command | Result |
|---|---|
| `bunx vitest run` | 2 files, 30 passed |
| `bunx tsgo --noEmit` | exit 0 |
| `npx eslint src/lib/repo.ts src/lib/sync-service.ts tests vitest.config.ts` | exit 0 |
| `npm run build` | exit 0 |
| `npm run build:apk` | exit 0 (20/20 pages prerendered) |
| `npx eslint .` | **baseline, unrelated:** ~1009 pre-existing problems (mostly prettier formatting) in files not touched here; none in changed files |

Not done: Gradle/JDK APK compile, signed APK, physical-device testing.

## Known limitations

- Dexie transactions protect the device only; cloud upload of a sync group is still per-row (a group stops on first rejection, as before).
- `enqueue` still fires a background `refreshPending()` from inside transactions (pre-existing pattern; harmless counter refresh).
- Pull logic (`pullAll`) was not changed; it already skips queued/pending rows.

## Manual Android checklist (to run on a real phone)

1. Install the APK built from `npm run cap:sync`; sign in; confirm dashboard loads.
2. Airplane mode on. Make a cash sale and an utang sale; confirm stock drops and customer balance rises.
3. Void the utang sale; tap Void twice quickly. Stock and balance return exactly once; one "void" movement in inventory.
4. Add a GCash cash-in with fee and screenshot (Pro); try a negative fee — it must be refused.
5. Force-close the app, reopen offline: all records still there, "Not yet synced" shown.
6. Airplane mode off: pending count drains to 0; edit a product during sync and confirm the edit uploads (check on a second device or after reinstall + restore).
7. Open a sale receipt from Sales history; confirm totals, cash and change are correct.
