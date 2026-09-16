# Clean up the after-sale card and the Pro list

## What changes

1. **After a sale** — the receipt card will show only the receipt details and the
   "New sale" button. The Print and Share buttons are removed.
2. **Pro plan comparison** — the printing/receipt-logo line ("Your logo on receipts")
   is removed, since printing will be revisited later.
3. **Pro plan comparison** — a new line is added: product photos, available on Pro
   only (Free shows a dash). This matches the photo upload that already works for Pro.

## Notes

- Printing itself stays in the code, just not offered on the after-sale card, so it can
  come back later without rework.
- No changes to prices, payment, or anything else on the plans screen.

## Technical detail

- `src/routes/_authenticated/pos.tsx`: delete the two-button grid (Print / Share) in the
  receipt dialog and drop the now-unused imports (`Printer`, `Share2`, `shareText`,
  `printReceipt`, `buildReceiptPrintDoc`, `buildReceiptText`, and `logoUrl` if unused).
- `src/routes/_authenticated/upgrade.tsx`: remove the `"Your logo on receipts"` row and add
  `{ label: "Product photos", free: false, pro: true }` to `ROWS`.
- Verify with typecheck/lint and a quick screenshot of the receipt dialog and plans screen.
