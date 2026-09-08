# Cleaner dashboard tiles + a clearer "Add cash entry" form

## What changes for you

1. **Dashboard**: the "Load & Other" shortcut is removed. The remaining seven shortcuts (Products, Inventory, GCash Cash In/Out, Expenses, Sales, Reports, Customers) re-flow so the row stays even.

2. **Add cash entry**: the two-button "Money in / Money out" switch becomes one drop-down with three choices:
   - **Cash In** — customer hands over cash (balance goes up)
   - **Cash Out** — customer takes out cash (balance goes down)
   - **Add Balance** — you top up your own e-wallet (balance goes up)

3. **New "Where from / Note" field**: a small drop-down with **Bank**, **GCash app**, **Cash on hand**, **Load / Bills**, **Other**, plus a short free-text box for anything else. When you pick "Other", the note box is the one that gets saved. This is optional — leave it blank and nothing changes.

4. The note shows on each row in Recent transactions next to the reference and fee, and the entry title shows which of the three kinds it was, so you can tell an "Add Balance" apart from a customer's "Cash In".

Existing entries and today's running balance stay exactly as they are; nothing is recalculated.

## Technical notes

- `src/routes/_authenticated/dashboard.tsx`: delete the `Load & Other` `ActionTile`.
- Store the note in a new `notes` column so it survives sync:
  - Migration on `public.cash_transactions`: `ADD COLUMN notes text` (nullable, no default change, no new grants/policies needed).
  - `src/lib/local-db.ts`: add `notes: string | null` to `LocalCashTransaction` and a purely additive Dexie `version(5)` (no index change required; existing rows read `notes` as `undefined` and are treated as empty).
  - `src/lib/repo.ts`: `CashTransactionInput` gains `notes?: string | null`; `saveCashTransaction` writes `input.notes?.trim() || null`. Sync payload picks it up automatically.
- `src/routes/_authenticated/cash.tsx`:
  - Replace the direction `Tabs` with a shadcn `Select` bound to a new `kind` state of `"cash_in" | "cash_out" | "add_balance"`; map `add_balance` to `transaction_type: "cash_in"` on save and record `notes` starting with `Add balance` so the row label can show it.
  - Add a `Select` for the note source plus an `Input` for free text; combine into the single `notes` string on submit.
  - The four action tiles keep pre-selecting the kind (Buy Load / Pay Bills preset the note source to "Load / Bills").
  - Recent transactions row: label from the stored kind, and append the note under the reference/fee line.
- Verify at 360 / 390 / 768 / 1024 px and run the typecheck.
