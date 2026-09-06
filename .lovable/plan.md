# Cash, Credit and Payment ledgers

Three new pages in BentaKo, all offline-first like the rest of the app: everything you record is saved on the device first and uploaded on its own when the connection is back.

## Cash ledger

One list of every peso moving in or out, newest first, with a running cash total on top.

- Record an entry: money in or money out, amount, and a type — drawer (starting cash, withdrawal, deposit, own money added) or an e-wallet service (GCash, Maya, bank, remittance).
- E-wallet entries also take a service fee, customer name and mobile number, and a reference number, and show the wallet and cash balance before/after.
- Filter chips: All, Drawer, GCash/Maya, Money in, Money out; plus Today / 7 days / 30 days.
- Cash from sales appears automatically as money in, so the total reflects the real drawer.

## Credit ledger (utang)

- Customer list with name, mobile number, notes and current balance; a total "utang out" figure on top.
- Tap a customer to see their history: charges from sales and payments received, plus buttons to record a payment or add a manual charge.
- At checkout, "Utang" becomes a payment option: pick or quickly add a customer, and the sale is saved with nothing received and the customer's balance increased. Stock still moves and a receipt is still produced, marked unpaid.
- Voiding an utang sale reverses the customer's balance too.

## Payment ledger

- Every payment received in one list — sales by cash, GCash, Maya, bank, other — together with utang repayments.
- Top of page: totals per payment type for the chosen period (Today / 7 days / 30 days) so it's easy to check the drawer and each wallet at closing.
- Filter by payment type, tap a row to open the sale or the payment it came from.

## Where to find them

New entries in the More menu: Cash ledger, Utang, Payments. Owners see profit-related figures; cashiers can record entries and payments but not delete history.

## Technical section

- Local storage: Dexie version 3 adds `cash_transactions`, `customers`, `customer_payments` stores (indexed by `id`, `store_id`, `created_at`, `sync_status`), with an upgrade that adds nothing destructive so existing offline sales survive.
- Types + repo: extend `src/lib/local-db.ts` with `LocalCashTransaction`, `LocalCustomer`, `LocalCustomerPayment` and add `saveCashTransaction`, `saveCustomer`, `recordCustomerPayment`, `addManualCharge` in `src/lib/repo.ts`, each writing the row, an audit entry, and a queue item in one Dexie transaction, exactly like `saveExpense`/`checkout`.
- Checkout: `checkout()` accepts `payment_method: "utang"` plus `customer_id`; in the same transaction it writes the sale, items, movements and a customer balance increment. `voidSale()` decrements the balance for utang sales.
- Sync: add `customers`, `cash_transactions`, `customer_payments` to `SyncEntity` and to `ENTITY_ORDER` (customers before payments) in `src/lib/sync-service.ts`; upserts stay keyed on the client UUID, so retries can't duplicate. Balances are recomputed locally from charges minus payments rather than trusting a synced number, avoiding cross-device drift.
- Cloud: tables `cash_transactions`, `customers`, `customer_payments` already exist with store-scoped RLS and grants. One additive migration adds `utang` to the `payment_method` enum and an index on `customer_payments(customer_id, created_at)`. No drops or renames.
- Routes: `src/routes/_authenticated/cash.tsx`, `utang.tsx`, `utang.$customerId.tsx`, `payments.tsx`, each `ssr: false` with its own `head()` metadata, reading through `useLiveQuery` like `reports.tsx`, plus new links in `more.tsx`.
- Verification: add entries offline in a phone-sized session, reload offline and confirm they persist, reconnect and confirm each row uploads once with correct balances.

Not included: supplier ledger, interest/due dates on utang, e-wallet API integration.
