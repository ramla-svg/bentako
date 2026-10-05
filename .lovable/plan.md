# Fix structured 58 mm receipt printing

## Changes
- Restore the Print action on completed POS receipts and sales-history receipts; both will build the same structured receipt document. Sharing remains plain text and separate.
- Replace the fragile grid receipt with print-safe tables: centered store/details, wrapping item names, fixed quantity and amount columns, prominent total, and correct cash/change, utang, or non-cash labels.
- Keep the existing 58 × 105 mm Android/browser print path and allow long receipts to continue onto additional pages without clipping rows. Preserve current Pro logo/footer rules.
- Harden the Android print WebView against duplicate page-finished callbacks and release it after the print adapter finishes. Document that this uses Android PrintManager, not direct Bluetooth/ESC-POS; printer services may simplify or reject HTML.
- Add synthetic receipt tests for long names, large amounts, many items, escaping, cash, utang, non-cash, and verify both screen call sites use structured printing.
- Update release notes and run tests, typecheck, web build, APK web-assets build, changed-file lint, and an HTML rendering check. No publish or production data changes.

## Technical notes
- `src/lib/receipt.ts` remains the single business-data builder.
- `src/lib/platform/print-service.ts` owns semantic receipt markup and shared print CSS.
- `ReceiptPrinterPlugin.java` remains an Android PrintManager adapter; native changes require a rebuilt APK to take effect.
