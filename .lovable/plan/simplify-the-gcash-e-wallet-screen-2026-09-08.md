# Simplify the GCash & E-Wallet screen

Strip the cash page down to GCash only: Cash In, Cash Out, Buy Load, Pay Bills. Remove every other provider and the balance-correction feature.

## What changes on the screen

- **Action tiles** — keep only 4: Cash In, Cash Out, Buy Load, Pay Bills. Remove "Send Money" and "More".
- **Add-entry dialog** — the provider picker disappears. Every entry is automatically a GCash transaction; no more Maya / Bank / Remittance / Drawer choices.
- **Filter pills** — remove "GCash/Maya" and "Drawer" pills (they only made sense with several providers). Keep All / Cash In / Cash Out.
- **Balance correction removed** — the "Balance" button on the blue card and the "Top up / correct balance" button both go away, along with the whole balance-by-hand dialog. The blue card still shows the running e-wallet balance and today's in/out/fees figures.
- Title/subtitle stay ("GCash & E-Wallet"), since everything on the page is now GCash.

## Technical details

- `src/routes/_authenticated/cash.tsx`
  - `PRESETS` cut to the 4 GCash presets.
  - Provider state/Select removed; `saveCashTransaction` is always called with `provider: "gcash"`.
  - `FILTERS` cut to All / Cash In / Cash Out; `FilterKey` loses "wallet" and "drawer".
  - Delete `openBalance`, `submitBalance`, `balanceOpen/balanceMode/balanceValue/balanceSign` state, both buttons, and the balance dialog markup.
- `src/lib/repo.ts` — `saveWalletAdjustment` becomes unused; remove it only if nothing else imports it (verify with a search first).
- `src/lib/local-db.ts` — `CASH_PROVIDERS` stays (old entries still carry their provider value; nothing is deleted or migrated).
- Existing entries with old providers (drawer/maya/bank) remain in the list and in the balance math — only the *creation* of new non-GCash entries is removed.
- Verify at 360/390/768 px and run `bunx tsgo --noEmit`.
