# Icon-only colour, matching the "Today at a glance" pattern

Three presentation tweaks so the coloured palette is used the same way everywhere: a neutral card with a single coloured icon circle — never a fully coloured tile.

## 1. Dashboard — Quick actions tiles

Today the `ActionTile` component (dashboard.tsx ~lines 390-413) paints the whole tile with the pastel tint (`TINT[tint]` on the `<Link>`). Change it to match `GlanceCard`:

- Card background: `border bg-card` (neutral), same rounded shape and min-height kept.
- Only the icon sits inside a coloured circle: reuse the `TINT[tint]` classes on an inner `<span className="grid size-9 place-items-center rounded-full">`.
- Layout stays column-centre on phones, top-left aligned on `sm:`.
- Labels and links unchanged; only styling moves.

## 2. GCash & E-Wallet — balance card colour

The wallet balance card (cash.tsx ~line 344) is `bg-wallet text-wallet-foreground` (blue). Change it to the main green:

- `bg-primary text-primary-foreground` for the whole card (same as the Dashboard "Sales today" card).
- The inner icon circle becomes `bg-primary-foreground/20` instead of `bg-wallet-foreground/20`.
- The `WalletStat` inner tiles stay as-is (already `bg-white/10`-style translucent on the card surface).

## 3. GCash & E-Wallet — action tiles (Cash In, Cash Out, Buy Load, Pay Bills)

The `PRESETS` buttons (cash.tsx ~lines 365-380) currently paint the whole button with `p.tint`. Change to neutral card + coloured icon circle:

- Button card: `border bg-card rounded-2xl`, neutral.
- Inner coloured circle uses `p.tint` on a `<span className="grid size-10 place-items-center rounded-full">`.
- Icon goes inside the circle; label stays below in `text-foreground`.

## Scope notes

- No data, query, or navigation changes — pure CSS/JSX restructure of two components in two route files.
- Dark mode keeps working because tints are already defined for `.dark`.
- The `--wallet` tokens stay in styles.css (the Recent transactions list on the dashboard and other places don't use them, but removing is out of scope).
- Verified with a typecheck and screenshots at 360 / 390 / 768 px.
