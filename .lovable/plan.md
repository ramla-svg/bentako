# Plan: Always show the Google account chooser on BentaKo sign-in

## Goal
Every time a user taps "Continue with Google" in BentaKo, show Google's account-selection screen — even right after signing out, when Google would otherwise silently reuse the last account. The user is only signed out of BentaKo/Supabase on Logout; their Google browser cookies/sessions are never touched.

## Root cause
`src/routes/auth.tsx` calls `lovable.auth.signInWithOAuth("google", { redirect_uri })` with no `prompt` parameter. Without `prompt: "select_account"`, Google reuses the most recently authorized account when a valid Google session already exists.

The Lovable wrapper at `src/integrations/lovable/index.ts` already forwards an `extraParams` object straight through to the OAuth call, so no change to the auto-generated wrapper is needed (and it must not be edited).

## Change (single edit)
In `src/routes/auth.tsx`, in `handleGoogle`, add `extraParams: { prompt: "select_account" }` to the `signInWithOAuth` options:

```tsx
const result = await lovable.auth.signInWithOAuth("google", {
  redirect_uri: window.location.origin,
  extraParams: { prompt: "select_account" },
});
```

That is the only code change. `prompt: "select_account"` forces Google to show the account chooser on every invocation, regardless of an existing Google session.

## Why this covers all target surfaces
- **Chrome** — standard Supabase/Lovable OAuth redirect; `prompt` is a standard Google OAuth parameter honored by the consent endpoint.
- **PWA** — the same in-app `lovable.auth.signInWithOAuth` call runs; `extraParams` flows into the OAuth request the service worker/WebView cannot strip.
- **Android APK / WebView wrapper** — the wrapper hosts the same web bundle, so the identical call applies. No native-side change is required.

## What is NOT changed
- We do not delete Google cookies or call any Google sign-out endpoint.
- We do not modify `src/integrations/lovable/index.ts` (auto-generated).
- Logout behavior (`useAppSession().signOut` → navigate to `/auth`) is unchanged; it signs the user out of BentaKo/Supabase only.

## Verification
1. `bunx tsgo --noEmit` passes.
2. In the preview: sign in with Account A → Logout → "Continue with Google" → confirm the Google account chooser appears → choose Account B → dashboard. Repeat Logout → "Continue with Google" → chooser appears again. Confirmed across two accounts.
