# Interactive "Subukan ang BentaKo" demo on the landing page

Inspired by mers.ph/how-it-works: visitors click through real-looking BentaKo screens with sample data before signing up.

## What visitors will see
- New section on the landing page: "Subukan mo — live demo" with a Phone / Desktop toggle.
- A phone-frame (or wide frame on desktop) showing a clickable mini BentaKo with tabs:
  1. Dashboard — today's sales, Cash on hand, GCash balance, low-stock alert.
  2. POS — tap sample products (Lucky Me, Coke, Kopiko) to add to cart, quick cash buttons, "Bayad" shows change and a sample 58mm receipt.
  3. Utang — sample customer list with balances, tap to see history.
  4. GCash — Cash In / Cash Out sample showing "GCash −₱500 · Cash on hand +₱510".
  5. Inventory — products with stock counts and a low-stock badge.
- Clear notice: "Demo lang ito — sample na tindahan, walang totoong datos. Walang nase-save."
- "Reset demo" button and a "Simulan nang libre" button to the existing sign-up.
- Free vs Pro tags on demo features only where truthful (e.g. photos/cloud save = Pro).

## Rules kept
- Demo is fully separate from the real app: no saving to the phone database, no cloud calls, no sign-in.
- Landing styling stays isolated; the real POS look and flows don't change.
- Works offline and on small phones; keyboard and screen-reader friendly.
- Only shows features BentaKo really has.

## Technical details
- New `src/components/landing-demo/` (DemoShell, screens, `demo-data.ts`, in-memory `useReducer` state) scoped CSS under landing styles.
- Insert into `public-landing.tsx` with a "Tingnan ang demo ↓" anchor in the hero.
- Optional route `/demo` (own head metadata) reusing the same component for full-screen.
- Small test for demo cart totals/change and that demo state never touches Dexie.
