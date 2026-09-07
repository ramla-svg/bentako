# E-wallet balance by hand, GCash screenshots, and breathing room at the screen edges

Three separate things, explained first, then built.

## 1. Why there is no balance option today

Right now the GCash/e-wallet balance on the blue card is not a number you type — BentaKo works it out from your entries: every cash-in you recorded, minus every cash-out. So on a fresh phone it starts at zero, and if your real GCash app says 4,500 there is no way to tell BentaKo that.

Fix: two ways to set it, both recorded as real entries so the ledger keeps adding up.

- **Set balance** — you type what your GCash app really shows. BentaKo compares it with its own figure and records the difference as one small "Balance correction" entry (up or down). Your card then matches your phone exactly.
- **Top up / correct** — you add or take out an amount as its own entry (for example a 2,000 top-up from the bank, or a 500 correction).

Both live behind a small "Balance" button on the blue card, and the "Set balance" one is also offered the first time the balance is still zero, so a new store can start correctly.

The balance stays one combined e-wallet number, as you chose. Each entry still remembers which wallet it belonged to, so the split can be shown later without redoing anything.

## 2. Screenshot of each GCash cash-in / cash-out

When adding or opening an e-wallet entry you can attach a photo — take one with the camera or pick the GCash screenshot from your gallery. Rules:

- The photo is kept **inside BentaKo's own storage on that phone**. It is never uploaded, so there is no cloud storage bill.
- Before saving, the photo is shrunk to a sensible size (long edge about 1200 px, JPEG) so hundreds of receipts stay small on the phone.
- The entry row shows a small thumbnail; tapping it opens the photo full screen with **Save / Share** (so you can copy it to Gallery, Drive or Messenger yourself) and **Remove**.
- Honest trade-off: because it lives only on the phone, clearing the app's data or switching phones loses the photos. That is why Save/Share is there.
- A note in the sheet says "Kept on this phone only" so nobody expects it to appear on another device.

## 3. Space around the edges

At the moment content starts about 12 px from the screen edge on phones, which is why it feels glued to the sides. I will widen the page gutters (roughly 16 px on phones, more on tablets), add the same breathing room to the top bar, the alert strip and the bottom bar, and keep the safe-area padding for the notch and gesture bar. Cards themselves keep their current inner padding, so nothing shrinks — only the outer margin grows. The sideways-scrolling strips keep running edge to edge on purpose, which reads as intentional.

## Technical notes

- `src/lib/local-db.ts`: new Dexie version 4 adding a local-only `cash_photos` table (`id, cash_transaction_id, created_at`) holding a Blob plus width/height/size. Purely additive; existing rows and the pending sync queue are untouched. This table is **not** added to `SyncEntity` and never enqueued, so nothing reaches the cloud.
- `src/lib/repo.ts`: `saveCashTransaction` gains an optional photo blob argument that writes the `cash_photos` row in the same Dexie transaction; plus `getCashPhoto`, `deleteCashPhoto`. New helper `saveWalletAdjustment({ mode: "set" | "delta", amount })` that computes the current derived balance and writes one `cash_in`/`cash_out` entry with `notes` marked as a balance correction — no new columns, no schema change, no backend work.
- `src/routes/_authenticated/cash.tsx`: "Balance" button on the wallet card opening a Set balance / Top up-correct dialog; file input with `accept="image/*"` and `capture` in the entry dialog, client-side canvas downscale, thumbnail in the list, full-screen viewer using the existing share/print service for Save/Share.
- `src/components/app-shell.tsx` and `src/styles.css`: gutter values bumped (`px-4 sm:px-6`, matching top bar / notice strip / bottom bar), safe-area classes kept.
- Verify at 320 / 390 / 430 / 768 / 1024 px, then run the typecheck.
