# Fix: products added offline don't show up

You added products while offline and the list came up empty straight away, in both the phone app and the browser, on a device that had already been signed in online.

I read through the saving and listing code and I cannot yet prove why the list is empty, so this plan starts by reproducing it and capturing the real cause, then fixes it. I would rather verify than guess: the two things the code makes possible are (a) the save never reaches the device storage and the error is swallowed, or (b) the save lands but under a different store than the list is asking for, so nothing matches.

## Step 1 — Reproduce and capture the cause

- Sign in, load the store, then go offline and add a product, in a phone-sized browser session driven end to end.
- Read what is actually written on the device right after saving: how many products are stored, which store they belong to, and which store the list is filtering by.
- Do the same after closing and reopening while still offline.
- Confirm whether the device storage refuses the write at all (some app/browser containers block or wipe it), which would explain the empty list with no error message.

## Step 2 — Fix what Step 1 shows

Depending on the finding, apply the matching fix:

- **Store mismatch:** stop accepting a save when the store is not known yet, and make lists read the same store identity that saving uses, so a product can never be filed under a store the list ignores.
- **Silent write failure:** surface a clear message ("this device is not allowing saving") instead of a success toast, and ask the device to keep BentaKo's data permanently so it is not cleared in the background.
- **List not refreshing:** make the products, POS and inventory lists re-read from the device after every save.

In all cases the "Product added" confirmation will only appear after the product is genuinely on the device.

## Step 3 — Add a small "Saved on this device" check

In Settings, a plain card showing how many products, sales and expenses are stored on the device and how many are still waiting to upload — so you can confirm at a glance that offline work is being kept, without needing me.

## Step 4 — Verify

- Offline: add two products, close the app, reopen offline, confirm both are still listed and usable in a sale.
- Reconnect: confirm both upload once and the waiting count returns to zero.
- Repeat the offline add in the phone-sized browser session and in the packaged app bundle.

## Technical notes

- Saving path: `saveProduct` in `src/lib/repo.ts` writes to Dexie then `enqueue` in `src/lib/sync-service.ts`; lists use `useLiveQuery` on `products.where("store_id").equals(storeId)` in `src/routes/_authenticated/products.tsx`, `pos.tsx`, `inventory.tsx`.
- `storeId` comes from the cached session snapshot in `src/hooks/use-app-session.tsx`; an empty or differing value makes the live query return `[]` while the write still succeeds — this is the first hypothesis to test.
- Add `navigator.storage.persist()` on first successful setup, and treat Dexie write rejections as user-visible failures rather than caught-and-toasted generic errors.
- No schema or cloud changes; no Phase 2 features.
