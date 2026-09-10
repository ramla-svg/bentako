# Bigger prices, working Print, and a logo on receipts

## 1. Bigger, easier-to-read prices (for senior users)

- Product tiles on the Sell screen: price jumps from small to large bold text, and the stock line under it gets a readable size instead of tiny 11px.
- The floating cart button: the running total gets larger.
- Review sale list: each line's "price x qty = amount" becomes clearly readable instead of extra-small.
- Review sale Total: already large, keep it and make the "Total" label bolder.
- Receipt on screen after a sale: item amounts and the Total line get bigger; the change amount stays the biggest number.
- Sales history receipt view gets the same treatment so numbers match everywhere.

No layout rebuild — tiles stay two-per-row on phones, text wraps instead of overflowing.

## 2. Fix the Print button

Current behaviour: it builds a hidden frame, calls print, then deletes the frame one second later. On phones (Chrome Android and the wrapped app) the print dialog opens asynchronously, so the frame is destroyed before the dialog can read it — nothing prints, or a blank page prints. It also silently reports success even when the wrapper app has no print support.

Fix:
- Build the receipt frame, wait for it to finish loading, then print.
- Keep the frame alive until printing actually finishes (print-finished event, or a safe delay as backup), then remove it.
- If the frame route is blocked, fall back to opening the receipt in a new window and printing from there.
- If nothing can print (some wrapped-app WebViews), show a clear message offering Share instead of a false success.
- Print the receipt as a proper narrow-roll page: store name/logo centred, monospaced items, big Total.

## 3. Logo on receipts for Pro

Right now there is nowhere to upload a logo, even though the app already has a place to store one, so nothing can appear on receipts. Plan:

- Add an "Receipt logo · Pro" area in Settings, next to the receipt footer: shows the current logo, an "Upload logo" button (camera or gallery on a phone), and "Remove logo".
- The image is shrunk on the phone before upload (small square, fast on slow data), stored in cloud storage, and linked to the shop.
- Free plan sees the area with a short "comes with Pro" note and an upgrade link; the owner only (not cashiers) can change it.
- The logo then shows: at the top of the on-screen receipt, in the printed receipt, and in the sales-history receipt view. Shared text receipts stay text-only.
- Pro receipts show the shop logo + custom footer and no "Powered by BentaKo"; free receipts keep the credit line.

## Technical notes

- `src/routes/_authenticated/pos.tsx` — price/total type scale on `ProductTile`, cart trigger, review lines, receipt dialog; logo `<img>` in the receipt block.
- `src/routes/_authenticated/sales.tsx` — matching type scale + logo in the receipt view.
- `src/lib/platform/print-service.ts` — rewrite `printReceiptText` into a load-then-print flow with `afterprint`/fallback-window cleanup, plus an optional `logoUrl` for an HTML receipt layout; return a distinct "unavailable" result so the UI can suggest Share.
- `src/lib/receipt.ts` — unchanged text output for Share; new optional richer HTML builder used only by print.
- `src/routes/_authenticated/settings.tsx` — logo upload card (owner + Pro gated), reusing `src/lib/image-file.ts` for downscaling.
- Storage: create a `store-logos` bucket (public read so printed/shared receipts can load it) with RLS on `storage.objects` allowing a shop's owner to write only under their own store id prefix.
- `stores.logo_url` already exists and is already selected in `use-app-session`; no schema change needed beyond storage policies.
