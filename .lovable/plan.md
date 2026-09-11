# Play Store readiness: payments policy + legal pages

## The situation, in plain terms

Google Play has one hard rule that affects BentaKo: if people can buy the Pro
upgrade **inside the Android app**, that purchase must go through Google Play
Billing. Google takes 15% of it. A GCash number or QR code shown inside the
Android app is exactly what gets an app rejected or removed.

What is completely allowed:

- Selling Pro by GCash on the **website / PWA**. Play rules only cover the app
  installed from Play.
- The Android app reading an account that is already Pro and unlocking the
  features. No purchase happens in the app, so no rule is broken.
- Charging ₱99 through Google Play Billing inside the Android app, if we want
  the in-app purchase path too (bigger job, needs a Google payments profile).

So the safe plan: keep GCash as the paid path on the web, and make the Android
build simply not show any way to pay. That is a small change, because the app
already knows when it is running as the installed Android app.

The second gap is legal: we have no Terms of Service, no Privacy Policy, and no
account-deletion page. Play requires all three (a privacy policy URL is
mandatory, and a way to delete an account is mandatory for any app with sign-in).
Play also needs a Data Safety form filled in, which must match what our policy says.

## What we will build

1. **Public legal pages** (visible without signing in, own URLs so Play Console
   can point to them):
   - Terms of Service — what BentaKo is, Free vs Pro, ₱99/month, refunds, that
     the store owner is responsible for their own sales data.
   - Privacy Policy — what we collect (email/name from Google sign-in, store and
     sales data for backup, GCash proof images for Pro payments), that receipt
     photos and activity history stay on the phone, no ads, no data selling,
     how to ask for deletion, contact email.
   - Account & data deletion — plain steps plus a working in-app delete button.
   - A short "Refunds & billing" section inside Terms.

2. **Delete my account** in Settings — confirmation dialog, removes the account
   and its cloud rows, signs out. This is what Play checks for.

3. **Android build hides paying**: when running as the installed Android app, the
   Upgrade screen and reminders show Pro benefits and status only, with wording
   like "Pro is managed on your BentaKo account" — no GCash number, no QR, no
   price-to-pay button, no link out to a payment page. On the web/PWA everything
   stays exactly as it is today.

4. **Links to legal pages** from Settings, the sign-in screen footer, and the
   onboarding consent line.

5. **Data Safety answers** written out for you to copy into Play Console, matching
   the privacy policy word for word.

## What you still have to provide

- A contact email for the privacy policy and Play Console (support address).
- Your business/owner name to put on the legal pages.
- Play Console developer account (one-time USD 25) and identity verification.
- App icon, feature graphic, at least 2 screenshots, short + full description.

## Technical notes

- New public routes: `src/routes/terms.tsx`, `src/routes/privacy.tsx`,
  `src/routes/delete-account.tsx` (outside `_authenticated`, each with its own
  `head()` metadata; `noindex` is not used — Play needs them crawlable).
- Payment gating uses the existing native detection in
  `src/lib/platform/native-bridge.ts`; applied in
  `src/routes/_authenticated/upgrade.tsx`, `src/components/gcash-pay-sheet.tsx`
  and `src/components/plan-reminder.tsx`. Pro entitlement logic in
  `src/lib/plan.ts` and `src/lib/billing*.ts` is untouched.
- Account deletion runs as an authenticated server function that removes the
  caller's store rows and their auth user, then signs out client-side.
- `/bk-admin` stays unlinked and admin-only.

## Out of scope for now

Google Play Billing integration for in-app ₱99 purchases. We can add it later if
you want to sell Pro from inside the Android app as well.
