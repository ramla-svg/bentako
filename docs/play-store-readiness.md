# BentaKo — Google Play Console readiness

## 1. Payments policy (the important one)

Google Play Billing is required for anything sold **inside** an app distributed
through Play. A GCash number or QR code inside the Android app breaks
Play Payments policy and is a common rejection/removal reason.

How BentaKo complies:

- Pro is sold only on the website / PWA (`https://bentako.lovable.app`).
- The Android build (Capacitor) hides every payment surface. `useIsNativeApp()`
  (`src/hooks/use-native-app.ts`) is checked in:
  - `src/routes/_authenticated/upgrade.tsx` — shows benefits + status only, no
    price button, no GCash sheet.
  - `src/components/plan-reminder.tsx` — informational wording only.
  - `src/routes/_authenticated/settings.tsx` — plan card links to the benefits
    page, with "managed on your BentaKo account".
- The app never links out to a payment page from the Android build.

If in-app buying is wanted later, add Google Play Billing (needs a Google
payments profile); do not re-enable GCash inside the Android app.

## 2. Required URLs for Play Console

| Field | URL |
| --- | --- |
| Privacy policy | https://bentako.lovable.app/privacy |
| Terms of service | https://bentako.lovable.app/terms |
| Account deletion | https://bentako.lovable.app/delete-account |

All three are public, crawlable routes. In-app deletion lives in
Settings → "Delete my account" (server function `deleteMyAccount` in
`src/lib/account.functions.ts`).

## 3. Data Safety form answers (copy into Play Console)

Does your app collect or share any of the required user data types? **Yes**

Data collected (all: collected, not shared with third parties; encrypted in
transit; user can request deletion):

| Data type | Collected | Required/Optional | Purpose |
| --- | --- | --- | --- |
| Name | Yes | Optional | App functionality, account management |
| Email address | Yes | Required | App functionality, account management |
| User IDs | Yes | Required | App functionality |
| Photos (GCash payment proof, store logo) | Yes | Optional | App functionality (verify Pro payment, receipt branding) |
| Purchase history (Pro payment records) | Yes | Optional | App functionality |
| Other financial info (own sales/cash/credit records) | Yes | Required | App functionality |
| Phone number (of utang customers, typed by the store owner) | Yes | Optional | App functionality |
| Device or other IDs | Yes | Required | App functionality (device limit per plan) |

Answer "No" for: location, health, messages, contacts (not read from the
phone), calendar, app activity/analytics, ads, crash logs shared externally.

Additional answers:
- Is all data encrypted in transit? **Yes**
- Do you provide a way for users to request data deletion? **Yes** — URL above
- Is any data shared with third parties? **No**
- Data used for advertising or tracking? **No**
- Committed to Play Families policy? Not applicable (app is for adults/business)

Receipt/transaction photos and activity history are stored on the device only —
they are not "collected" for Data Safety purposes.

## 4. Remaining Play Console checklist (manual steps)

- Developer account (USD 25 one-time) + identity/address verification.
- App signing: create an upload keystore, build an **AAB** (`bundleRelease`),
  enable Play App Signing.
- Store listing: app name, short description (80 chars), full description,
  512x512 icon, 1024x500 feature graphic, at least 2 phone screenshots.
- Content rating questionnaire, target audience (18+), ads declaration (no ads).
- Data Safety form (section 3), privacy policy URL, account deletion URL.
- Closed test with at least 12 testers for 14 days (required for new personal
  developer accounts).
- Declare permissions used; BentaKo needs no sensitive permissions
  (no location, no SMS, no contacts). Printing uses the system print service.
