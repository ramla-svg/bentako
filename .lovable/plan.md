# Owner admin card, GCash QR upload, and the two Pro limits

## What's true today

- The private owner screen already exists at the address `/bk-admin`. It only shows data to emails listed in the app's super-admin setting, and your email `ayisha.janna.almar@gmail.com` is already set there.
- That screen already lets you type your GCash name, number, and a **link** to a QR image — but there is no way to upload a QR photo, and no card anywhere in the app that takes you to the screen, so it feels missing.
- The 3-phone and 2-cashier Pro limits are not enforced anywhere yet.

## What I'll build

**1. An "Owner tools" card you can actually see**

In Settings (and in the More list), add a card that only appears for your admin email: "Owner tools — GCash details and Pro approvals", tapping it opens the private screen. Nobody else ever sees the card.

**2. Upload your GCash QR photo**

On the private screen, replace the bare link box with a proper card:

```text
GCash for payments
Name on GCash   [ Almar Evardone            ]
GCash number    [ 09XX XXX XXXX             ]

QR code
[  QR image preview  ]   [ Upload QR photo ]  [ Remove ]

[ Save GCash details ]
```

The photo is stored in a public "billing" area of the app so the payment sheet can show it to shop owners. Shop owners see exactly this name, number and QR when they tap Upgrade.

**3. Enforce 3 phones on Pro / 1 phone on Free**

Each phone gets a small hidden id the first time BentaKo runs on it, and the shop keeps a list of its phones (name, last used). On sign-in:

- Under the limit: the phone is added silently, nothing changes for the user.
- At the limit: a sheet appears — "This shop already uses N phones" — with two choices: **Release the oldest phone** (frees a slot and continues) or **See BentaKo Pro** (Free shops only). No one is locked out of their data; they just choose which phones count.

Settings gains a "Phones using this shop" list where the owner can remove a phone.

**4. Enforce 2 cashier sign-ins on Pro / owner-only on Free**

When the owner adds or activates a cashier beyond the allowance, the same style of message appears with a link to Pro. Existing cashiers are never removed.

## Technical notes

- New table `public.store_devices` (id, store_id, device_id unique per store, label, last_seen_at) with GRANTs for `authenticated` and RLS scoped to `store_id = public.current_store_id()`; owner may delete rows.
- Device id generated client-side, kept in local storage; registration and eviction go through a server function so it works with RLS.
- Limits read from the existing `PLAN_LIMITS` in `src/lib/plan.ts` (`devices`, `cashiers`) — no new pricing logic.
- QR upload: new public bucket `billing-assets` with public SELECT and insert/update restricted to super-admin via a server function using the privileged client; `app_settings.gcash_qr_url` stores the resulting public URL, so the existing payment sheet needs no change.
- The admin card is gated by the existing `isBillingAdmin` server function, so the check stays server-side.
