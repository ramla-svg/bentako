# Finish the three ledgers

The groundwork is in place (device storage and the cloud already accept utang sales, cash entries, customers and payments), but the three pages themselves were never built, so there is nothing to open yet. This finishes the visible part.

## Cash ledger (new page)

- One list of money in and money out, newest first, with the running cash total on top.
- Add an entry: money in / money out, amount, and a type — drawer (starting cash, withdrawal, deposit, own money added) or a service (GCash, Maya, bank, remittance).
- Service entries also take a fee, customer name and mobile number, and a reference number.
- Chips to filter: All, Drawer, GCash/Maya, Money in, Money out, plus Today / 7 days / 30 days.
- Cash taken in from sales is counted in the total automatically.

## Utang (credit) ledger (new pages)

- Customer list with name, mobile number, balance, and total utang out on top; add or edit a customer.
- Tap a customer to see their history — charges from sales and payments received — with buttons to record a payment or add a manual charge.
- At checkout, Utang becomes a payment choice: pick or quickly add a customer, the sale saves with nothing received, stock still moves, the receipt is marked unpaid, and the balance goes up. Voiding an utang sale puts the balance back.

## Payments ledger (new page)

- Every payment received in one list: sales by cash, GCash, Maya, bank, other, plus utang repayments.
- Totals per payment type for Today / 7 days / 30 days, so the drawer and each wallet can be checked at closing.
- Filter by payment type; tap a row to open the sale it came from.

## Where to find them

Three new items in the More menu: Cash ledger, Utang, Payments. Everything works with no connection and uploads on its own when the connection returns.

## Technical section

- `src/lib/repo.ts`: add `saveCashTransaction`, `saveCustomer`, `recordCustomerPayment`, `addManualCharge`, and `voidSale` balance reversal for utang sales. Each writes the row, an audit entry and queue items inside one Dexie transaction, mirroring `saveExpense`/`checkout`.
- `src/lib/sync-service.ts`: add `customers`, `cash_transactions`, `customer_payments` to `ENTITY_ORDER` (customers before payments, after sales), and add `service_fee`, `credit_balance`, `wallet_before/after`, `cash_before/after` to `NUMERIC_FIELDS`. Pull path includes the same tables.
- New routes, each `ssr: false` with its own `head()` metadata, reading via `useLiveQuery` like `reports.tsx`: `src/routes/_authenticated/cash.tsx`, `utang.tsx`, `utang.$customerId.tsx`, `payments.tsx`.
- `src/routes/_authenticated/more.tsx`: three new links.
- `src/routes/_authenticated/pos.tsx`: utang payment option with customer picker/quick-add, passing `customer_id` into the existing `checkout()` signature; receipt shows Unpaid.
- Balances shown are derived locally from charges minus payments, so multi-device drift can't corrupt them.
- Local schema (Dexie v3) and the cloud migration are already applied; no further schema change needed.

Not included: supplier ledger, due dates/interest on utang, e-wallet API integration.
