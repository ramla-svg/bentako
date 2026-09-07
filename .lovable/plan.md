# Match the mockup look: Dashboard + GCash / E-Wallet screen

Goal: restyle two screens to closely follow the uploaded design, using the app's existing data. No new backend work, no new business rules.

## Screen 1 — Dashboard (Home)

- Top row: BentaKo logo mark with the wordmark and the tagline "SIMPLE BUSINESS. BIGGER TOMORROW.", a bell with a red dot when there are stock alerts, and a round initials badge for the signed-in person.
- Greeting line: "Kumusta, Ayisha!" with a waving hand, and under it the person's name and role. A green "Synced" / "Offline" pill sits to the right (reuses the existing connection chip logic, restyled as a pill).
- Big green card: SALES TODAY with today's date and a chevron to Sales, the peso total in large type, a small "vs yesterday" change line with arrow, a faint bar sparkline of recent days on the right, three inner tiles (Profit, Transactions, Items Sold), and a full-width white "New Sale" button.
- "Today at a glance" row (horizontal, scrollable on small phones): Expenses, Low Stock (amber, warning look), GCash balance (blue circle), Utang total — each tappable to its page, each with "View all" link on the section header.
- "Quick actions" grid of coloured tiles matching the mockup palette: Products, Inventory, GCash Cash In/Out, Load & Other, Expenses, Sales, Reports, Customers (Utang).
- "Recent transactions" list: circular icon, transaction number, "Sale · time", amount and item count on the right.
- Bottom bar keeps the existing five items with the raised round POS button (already in place), restyled to match.

## Screen 2 — GCash & E-Wallet (the existing Cash ledger page)

- Header: back chevron, title "GCash & E-Wallet", subtitle "Cash in/out, load, bills and more", a "Synced" pill and a history icon.
- Blue balance card: provider mark, "GCash Balance" with the running wallet balance, and four inline figures — Cash In Today, Cash Out Today, Fees Earned, Transactions.
- Six action tiles in the mockup's pastel colours: Cash In, Cash Out, Send Money, Buy Load, Pay Bills, More. Each opens the existing add-entry dialog pre-set to that kind of entry.
- Pill filter row: All / Cash In/Out / Load / Bills / Send Money.
- "Recent Transactions" list styled like the mockup: coloured circular icon, title with customer name, date/time, "Ref: … · Fee: …" line, signed amount in green/red, and a chevron.
- Empty state kept for stores with no entries yet.

## Notes and trade-offs

- The mockup's numbers are samples; every figure comes from the store's own records. Where the app has no such figure yet, the tile shows the real value (often ₱0.00) rather than a made-up one.
- "Send Money", "Buy Load" and "Pay Bills" are recorded as e-wallet entries with a kind label, so they appear correctly grouped in the filters. If a separate breakdown per kind is wanted later, that can follow.
- GCash balance is computed as wallet money in minus wallet money out from existing entries; there is no live GCash connection.
- Small phones through tablets are covered — the wide rows scroll sideways only inside their own strip, keeping the page lock that was fixed earlier.

## Technical scope

- New tokens in `src/styles.css` for the pastel tile colours (mint, blue, rose, lavender, peach, sky) plus a `--wallet` blue for the balance card, defined for light and dark.
- Rewrite of `src/routes/_authenticated/dashboard.tsx` presentation; the existing `useLiveQuery` aggregation stays, extended with yesterday's revenue, a 7-day series for the sparkline, wallet balance and utang total (all read from Dexie).
- Rewrite of `src/routes/_authenticated/cash.tsx` presentation; existing queries and `saveCashTransaction` calls unchanged apart from a `kind` label on new e-wallet entries.
- Header/pill pieces added to `src/components/app-shell.tsx` (logo lock-up, avatar, notification bell) so both screens share them.
- A generated BentaKo logo mark asset for the header.
- Verified with a typecheck and screenshots at 320 / 390 / 430 / 768 / 1024 px.
