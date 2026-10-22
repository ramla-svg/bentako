# GCash service flow correction

## Behavior

- New customer Cash In entries decrease the store e-wallet and default to receiving physical cash.
- New customer Cash Out entries increase the store e-wallet and default to handing out physical cash.
- Buy Load and Pay Bills spend the e-wallet and default to receiving customer cash.
- Add Balance increases the wallet; bank/online funding defaults to no physical cash, while Cash on hand funding defaults to taking physical cash out.
- Cash-collected fees affect physical cash once, independently of wallet principal. This does not add support for separately tracking wallet-collected fees.
- Labels, filters and today’s Cash In/Out figures use the customer service kind, not wallet direction. List amounts explicitly identify their e-wallet effect; physical cash effects are shown separately.
- Dashboard, cash page and repository wallet balances share cents-precision totals and exclude voided/physical-only/other-store rows.
- Existing ambiguous entries retain recorded directions, amounts and labels. A visible warning explains why the recorded balance can differ from the actual GCash app; no historical guesses, corrections or backfill occurred.

## Storage compatibility

Applied additive migration `drizzle/migrations/0012_gcash_service_kind.sql`: nullable `cash_transactions.service_kind`, with existing records left untouched. Generated cloud types refreshed successfully. New local rows and queue snapshots include the explicit service kind. No new Dexie index/version is needed for an optional unindexed field. Old clients continue to read stored wallet direction, but cannot reliably show new customer service labels until updated.

## Verification

- `bunx vitest run`: **137 tests passed across 13 files**; 12 new flow tests cover directions, fees, top-ups, load/bills, cents, legacy retention, store isolation, queued metadata, and counted physical cash.
- `bunx eslint src/lib/cash-flow.ts src/lib/cash-drawer.ts src/lib/local-db.ts src/lib/repo.ts src/routes/_authenticated/cash.tsx src/routes/_authenticated/dashboard.tsx tests/cash-flow.test.ts`: passed with no reported errors or warnings.
- `git diff --check`: passed.
- Latest automatic preview build signal: **build OK**. No separate manual build or standalone typecheck was run.
- `python3 /tmp/browser/gcash-flow/check_gcash_flow.py`: passed using disposable, synthetic, offline store fixtures with cloud traffic blocked, at **1366×900** and **360×800**. Saved Cash In, Cash Out, Buy Load, Pay Bills and bank Add Balance; verified corresponding wallet/physical balances, customer-service filters, source-labelled physical history, no horizontal overflow, and no page errors. Visually checked screenshots of both physical-cash selector sizes, saved entries and cash history.

No real business records or subscriptions changed, no publishing, and no physical Android/AppMint device or live GCash/cloud-sync end-to-end test. This is recording software, not a GCash integration; it does not fetch the actual wallet balance.