# Getting paid ₱99 with GCash — no Play Store needed

## Are we ready to charge?

Almost. What already works today:

- Every shop has a plan saved with it (Free or Pro, plus when Pro ends and a 14-day grace period so nobody is cut off mid-selling-day).
- Free is already limited: 60 products, 7 days of reports, sales history capped at 7 days, no cloud backup, and "Powered by BentaKo" on receipts.
- The Plan & pricing screen with ₱99/month and ₱999/year is built. Its Upgrade button currently only says "Pro is opening soon".
- Cloud backup switches itself on the moment a shop becomes Pro, and everything saved while on Free is uploaded then — nothing is lost.

What is still missing before money can come in:

- No way for a shop owner to pay you.
- No private screen where you confirm a payment and switch that shop to Pro.
- Two promised Pro perks are not built yet: export to spreadsheet, and your own logo on receipts. Extra phones and cashier accounts are also not limited yet.

Because BentaKo is installed from the website as a PWA and not from the Play Store, Google Play Billing does not apply and Google takes no cut. You keep the full ₱99.

## How a shop owner pays you (step by step)

1. Owner opens **More → Plan & pricing**, picks Monthly ₱99 or Yearly ₱999, and taps Upgrade.
2. A payment sheet opens showing your GCash name and number, a QR code they can scan from their GCash app, the exact amount, and a reference code created for that shop (e.g. `BK-4821`).
3. They pay in GCash — either by scanning the QR or sending to your number — and copy the GCash reference number from the receipt.
4. Back in BentaKo they type the GCash reference number, the amount, and optionally attach a screenshot, then tap **I have paid**.
5. Their screen changes to "Waiting for confirmation — usually within the day". Selling keeps working normally the whole time.
6. You get the money in your own GCash, open your private screen in BentaKo, see the request with shop name, amount and reference number, and tap **Approve**.
7. That shop turns Pro instantly (30 days for monthly, 365 for yearly; approving again while still active adds to the end date instead of overwriting it). Their phone picks it up on the next open and starts backing up.
8. If the reference does not match anything in your GCash you tap **Reject** with a short reason, and they see it with a "Try again" button.

Text mockup of the payment sheet the owner sees:

```text
 ────────────────────────────────
  Pay with GCash                ✕
 ────────────────────────────────
  BentaKo Pro — Monthly
  Amount to send        ₱99.00

  [   QR CODE IMAGE   ]
  Scan with your GCash app

  GCash name    ALMAR E.
  GCash number  0917 xxx xxxx   [Copy]
  Reference     BK-4821         [Copy]
  Put BK-4821 in the GCash notes
  ────────────────────────────
  GCash reference no. [ 1234567890 ]
  Amount sent         [ 99        ]
  Screenshot (optional)  [ Attach ]

  [        I have paid         ]
  Confirmed within the day. Your
  sales keep working meanwhile.
 ────────────────────────────────
```

Text mockup of your private approval screen:

```text
  Pro payments                3 waiting
 ──────────────────────────────────────
  Aling Nena Store        ₱99  Monthly
  Ref 1234567890 · today 9:12 AM
  [ Approve ]  [ Reject ]  [ Photo ]
 ──────────────────────────────────────
  JR Mini Mart           ₱999  Yearly
  Ref 9988776655 · yesterday
  [ Approve ]  [ Reject ]
 ──────────────────────────────────────
  Approved this month      12 · ₱1,287
```

## How you earn from it

- ₱99 per shop per month, ₱999 per year. GCash person-to-person is free, so you keep the whole amount.
- Costs stay tiny on purpose: Free shops never upload anything, and activity history and receipt photos never leave the phone. Only paying shops use cloud storage, so your cost grows only when your income does.
- Renewals are manual: shops get a reminder in the app 7 days before Pro ends and again on the last day, with the same Pay with GCash sheet. The 14-day grace period means a late payer is never locked out abruptly.

## What I will build

1. **Payments table.** A `plan_payments` record per request: shop, plan period, amount, GCash reference, optional screenshot, status (pending / approved / rejected), reason, who approved, timestamps. Shop owners may create and read their own; only you can approve.
2. **Your GCash details in one place.** Number, account name and QR image stored as app settings so you can change them without a new release.
3. **Pay with GCash sheet** on the upgrade screen, replacing "Pro is opening soon" — QR, copyable number, per-shop reference code, reference-number form, and the waiting state.
4. **Private approval screen** at a non-advertised address, visible only to your account: pending list, Approve, Reject with reason, and a simple monthly total. Approving extends that shop's Pro end date.
5. **Reminders** in the app at 7 days left, 1 day left, and during grace.
6. **Finish the Pro perks so ₱99 is honest:** export sales to a spreadsheet file (Pro only), your own logo and footer on receipts (Pro only), and the 3-phone / 2-cashier limits.

## Technical notes

- New table `public.plan_payments` with GRANTs and RLS: owners `select`/`insert` where `store_id = current_store_id()`; approval happens in a server function that checks the caller against an allow-list of super-admin user ids stored in a secret, then uses the privileged client to write `stores.plan`, `plan_period`, `plan_expires_at`, `plan_source = 'gcash_manual'`.
- Screenshots stay on the phone (Dexie blob) and are only uploaded to a private Storage bucket when the owner attaches one to a payment request, matching the existing "photos stay on the phone" rule.
- The GCash QR image and number live in a small `app_settings` table readable by `authenticated`, writable only by super-admin, so nothing is hardcoded.
- Plan resolution keeps using `src/lib/plan.ts` (`activePlan`, grace period) — no change to how limits are read, so everything works offline.
- No Lovable Payments, Stripe or Paddle is enabled in this step; a proper gateway (PayMongo/Xendit for automatic GCash, QR Ph, Maya and cards) can be added later without changing the plan model, since it would simply create an already-approved `plan_payments` row through a webhook.
