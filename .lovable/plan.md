# Lower BentaKo Pro to ₱59 a month

## What changes
- Pro monthly price goes from ₱99 to **₱59** everywhere: Upgrade page, Settings button, the 60-product limit message, Terms page, and page descriptions.
- New GCash payment requests ask for ₱59 (monthly).
- **Yearly plan:** at ₱59/month, the current ₱999/year would cost more than paying monthly. The plan sets yearly to **₱599/year** (saves ₱109). Tell me if you want a different yearly price, or to remove yearly.

## What stays the same
- Stores already on Pro keep their paid time; they pay ₱59 when they next renew.
- Past payments, Owner Tools history and income totals are not changed (old ₱99 payments stay ₱99).
- Free plan, the 60-product limit, and all Pro features stay the same.
- Nothing is published.

## Technical details
- `src/lib/plan.ts`: `PRO_PRICE_MONTHLY = 59`, `PRO_PRICE_YEARLY = 599` (ANNUAL_SAVING auto = 109).
- Replace hardcoded "₱99" in `upgrade.tsx` head(), `settings.tsx`, `products.tsx` with `PRO_PRICE_MONTHLY`.
- `billing-client.ts` already derives amount from the constants.
- Update `tests/plan.test.ts` to assert 59 / 599 / 109 saving; run tests.
- Update memory `plan-accuracy` with the new prices.
