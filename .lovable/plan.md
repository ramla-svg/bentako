# Free tier and ₱99 paid tier for BentaKo

## The money question first

BentaKo's only real running cost is cloud backup and sign-in. Everything else already happens on the phone, so a free tier is genuinely cheap for us. That points to one honest split:

**Free = the whole shop runs on your phone. Paid = your records are safe off the phone, and the shop can grow.**

That way the free tier is never crippled (a tindera can run her store forever on ₱0), and the paid tier sells the two things people pay for: not losing data, and more than one phone/helper.

## Recommended tiers

### FREE — ₱0 / month
- Full POS, receipts, printing and sharing
- Works offline, forever
- Up to **60 products**
- **1 phone, owner only** (no cashier accounts)
- Cash In / Cash Out ledger, utang ledger, expenses
- GCash screenshots (kept on the phone)
- Reports: **today + last 7 days**
- Records live on that phone only — no cloud backup
- Small "Powered by BentaKo" line on receipts

### BENTAKO PRO — ₱99 / month
- Everything in Free, plus:
- **Unlimited products**
- **Up to 3 phones**, plus **2 cashier accounts** with their own sign-in
- **Cloud backup and restore** — change or lose a phone and get everything back
- Full report history + **export to spreadsheet**
- Your own receipt footer and store logo, no BentaKo line
- Priority support

Yearly option: **₱999 / year** (2 months free) — this is what actually makes the revenue predictable, so it should be offered next to the monthly price from day one.

## Text mockup — the upgrade screen

```text
┌──────────────────────────────────────────┐
│  ‹   BentaKo Pro                         │
│      Protect your records. Grow the shop.│
├──────────────────────────────────────────┤
│                                          │
│   ┌────────────────┐  ┌────────────────┐ │
│   │  FREE          │  │  PRO   POPULAR │ │
│   │  ₱0 /month     │  │  ₱99 /month    │ │
│   │  Your plan     │  │  ₱999 /year    │ │
│   └────────────────┘  └────────────────┘ │
│                                          │
│                        FREE      PRO     │
│   Products            60        Walang   │
│                                 limit    │
│   Phones               1          3      │
│   Cashier accounts     —          2      │
│   Cloud backup         —          ✓      │
│   Report history     7 days   Buong      │
│                                history   │
│   Export to Excel      —          ✓      │
│   Your logo on receipt —          ✓      │
│   Offline POS          ✓          ✓      │
│   Cash & utang ledger  ✓          ✓      │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │      Upgrade — ₱99 / month       │   │
│   └──────────────────────────────────┘   │
│      Or ₱999 / year — save 2 months      │
│                                          │
│   Cancel anytime. Your records stay on    │
│   your phone even if you stop paying.     │
└──────────────────────────────────────────┘
```

Where the limits show up while using the app, so nothing feels like a trap:

```text
Products screen, free plan at 58 items
┌──────────────────────────────────────────┐
│  58 of 60 products used     [ Upgrade ]  │
└──────────────────────────────────────────┘

Trying to add the 61st
┌──────────────────────────────────────────┐
│  Free plan holds 60 products             │
│  Pro removes the limit for ₱99/month     │
│  [ Maybe later ]      [ See Pro ]        │
└──────────────────────────────────────────┘

Settings, free plan
┌──────────────────────────────────────────┐
│  Cloud backup            Pro only        │
│  Your records are on this phone only.    │
│  Change phones safely with Pro. [ See ]  │
└──────────────────────────────────────────┘
```

Settings on Pro shows plan, next billing date, and a Manage subscription button.

## What gets built now vs later

Payments cannot be switched on today: Lovable Payments needs a Pro workspace, and once BentaKo is on the Play Store, Google requires **Google Play Billing** for in-app subscriptions — a card checkout inside the Android app would get the listing rejected. So the sensible build order is:

**Now (this plan):** the whole tier system except the charging — plan stored per store, limits enforced, upgrade screen, Settings plan card, and a working way for us to mark a store as Pro by hand. Every existing store is grandfathered to Free with no interruption, and we can already sell Pro manually (GCash transfer, we flip the switch) which is how most Philippine SaaS starts earning.

**Later (separate step):** wire the real purchase — Google Play Billing inside the Android app, and Paddle or Stripe for people who sign up on the website. Both just set the same plan fields, so nothing built now gets thrown away.

## Technical notes

- Migration on `public.stores`: `plan text not null default 'free'`, `plan_period text` (`monthly` | `yearly`), `plan_expires_at timestamptz`, `plan_source text` (`manual` | `play` | `web`). All nullable/defaulted, so no breaking change and no new grants needed (existing store policies cover it).
- `src/lib/local-db.ts`: the cached store snapshot carries the four new fields; a purely additive Dexie version bump. No new tables.
- New `src/lib/plan.ts`: `type PlanId = "free" | "pro"`, a `PLAN_LIMITS` table (`products`, `devices`, `cashiers`, `reportDays`, `cloudBackup`, `export`, `branding`), `activePlan(store)` returning `free` when `plan_expires_at` has passed, and helpers `canAddProduct(count)`, `reportWindowDays()`, `isPro()`. Read from the cached snapshot, so limits are correct offline; expiry gets a **14-day grace period** so a store with no signal is never downgraded mid-day.
- `src/hooks/use-app-session.tsx`: expose `plan` alongside `store`/`role` from the same snapshot it already loads.
- Enforcement points: `src/routes/_authenticated/products.tsx` (count check + counter strip + limit dialog), `reports.tsx` and `sales.tsx` (clamp the range picker to 7 days on Free with an inline upsell), `settings.tsx` (plan card; existing export/logo controls gated), `src/lib/sync-service.ts` (skip the push/pull entirely on Free — this is also the cost saving, since Free stores stop using the backend beyond sign-in).
- New route `src/routes/_authenticated/upgrade.tsx` (`ssr: false`, own `head()`), linked from More, Settings, and every limit dialog. Its Upgrade button opens a "Pro is opening soon — message us to activate" sheet until billing is wired.
- Cashier accounts and the device count are read from `user_roles` / a `devices` count already implied by the store snapshot; on Free, adding a second cashier is blocked in Settings with the same upsell.
- Nothing existing is removed: current stores read `plan = 'free'`, and because they have been syncing already, they keep their cloud copy — sync only stops for new writes, and Settings says so plainly.
- Verify at 360 / 390 / 768 / 1024 px, check the limit dialog and clamped report range offline, then run the typecheck.
