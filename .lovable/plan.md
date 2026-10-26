# Remove the "physical cash" question from GCash entries

## Why it asks today
When we fixed the GCash direction, we added a required "Physical cash" choice (Add / Take out / None) so Cash on hand would never be guessed. You're right that for normal tindahan work the answer is always the same, so the question only causes confusion.

## New behavior: the app decides automatically

| Transaction | Store GCash | Cash on hand (drawer) |
|---|---|---|
| Cash In (customer gives cash, you send GCash) | − amount | + amount |
| Cash Out (customer sends GCash, you give cash) | + amount | − amount |
| Buy Load / Pay Bills | − amount | + amount |
| Add Balance from Bank / GCash app / Other | + amount | no change |
| Add Balance from "Cash on hand" | + amount | − amount |

- Service fee: assumed paid in cash and added to Cash on hand (the usual case). One small optional switch, "Fee was deducted from GCash instead", stays for the rare exception, hidden under the fee box and off by default.
- The three big buttons (Add physical cash / Take physical cash out / No physical cash) and the "Choose what happened to the physical cash" error are removed.
- The summary box stays, so before saving the owner still sees in plain words: "GCash −₱500 · Cash on hand +₱510".
- Old saved entries are not changed.

Example — Cash Out ₱1,000, fee ₱20 paid in cash: GCash +₱1,000, Cash on hand −₱1,000 + ₱20 = −₱980.

## Technical details
- `src/routes/_authenticated/cash.tsx`: drop `DRAWER_MOVES` radio group and `drawerMove` state; compute `physicalCashEffect(suggestedPhysicalCash(kind, source), amount, feeInCash ? fee : 0)` at submit; `feeInCash` defaults to `true`, exposed as an inverted "deducted from GCash" switch; remove the missing-choice validation; simplify the helper text.
- `src/lib/cash-flow.ts` already holds the rules (`suggestedPhysicalCash`, `physicalCashEffect`); no change to wallet math or stored fields; `drawer_effect` still saved explicitly so Cash on hand stays accurate.
- Tests: add cases in `tests/cash-flow.test.ts` asserting Cash In ₱500 + ₱10 fee → drawer +510, Cash Out ₱1,000 + ₱20 fee → drawer −980, Add Balance from Bank → 0, from Cash on hand → −amount. Run full vitest.
- Verify the form at 360px and desktop with Playwright.
