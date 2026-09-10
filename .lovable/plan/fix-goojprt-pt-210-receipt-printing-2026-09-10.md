# Fix Goojprt PT-210 receipt printing

## What will change

- Stop asking Android to print from a hidden receipt frame, because many Android print services ignore that frame and capture the visible BentaKo screen instead.
- Put a temporary, print-only receipt directly in the active page before opening the print dialog.
- During printing, hide every part of the BentaKo interface and show only the 58 × 105 mm receipt.
- Force black text, white background, grayscale logo, compact grocery columns, and the 58 mm paper size in the print rules.
- Remove the temporary receipt after printing finishes, with a safe delayed cleanup for Android print services that do not report completion.
- Keep the separate-frame method only as a browser fallback where it is reliable.

## Verification

- Confirm the active page contains only the receipt in print mode, not the sale dialog or surrounding app.
- Confirm the printed layout remains `QTY — ITEM — AMOUNT`, black and white, and sized for 58 × 105 mm paper.
- Check that printing still opens normally from the completed-sale receipt.
