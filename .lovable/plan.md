# Fix: white screen after signing out and signing back in

## What is happening

Every screen in BentaKo is drawn by the app's code after it starts up — the page
that arrives from the server is empty on purpose. So if the app's code fails to
start for any reason, there is nothing at all to look at: a white screen, no
sign-in form, no message, no way out except closing and reopening.

Signing out is the moment most likely to trigger it, because it is the only place
that tears down the saved session and immediately sends you to a different screen
while the offline copy of the app is also being checked for updates. If the saved
offline copy and the fresh page disagree about which app files to load, the load
fails and you get the blank screen.

Right now there is no safety net for that case, which is why it looks like a dead
end instead of a reload.

## The fix

1. **Never show a blank screen again.** Add a plain "Starting BentaKo…" panel and
   a "Reload" button into the page that arrives from the server, before the app
   starts. If startup succeeds it is replaced instantly and nobody sees it; if
   startup fails, the user sees the panel and a working button instead of white.

2. **Catch failed startup and recover automatically.** Listen for the specific
   startup failure (a missing app file / unhandled load error) and, once only,
   reload the page with a cache-busting marker so the freshest copy is fetched.
   A one-shot marker prevents any reload loop; the second failure leaves the
   visible panel with the manual button.

3. **Make signing out a clean restart.** Instead of an in-app navigation, sign
   out will: stop in-flight data requests, clear cached data, clear the saved
   device session, tell the backend to end the session, and then hard-load
   `/auth`. A clean boot removes the half-torn-down state that the white screen
   comes from, and also guarantees the sign-in screen actually appears.

4. **Stop the offline copy from serving a stale page.** The stored copy of the
   page will be refreshed on every successful visit and the sign-in route will be
   excluded from the offline page fallback, so `/auth` is always served fresh
   when the network is there.

5. **Make the sign-in screen self-healing.** If the sign-in screen is opened
   while a valid session still exists, it already forwards you on; add the
   reverse guard so a stuck "loading" state falls back to showing the form after
   a few seconds rather than waiting forever.

## Technical notes

- `src/routes/__root.tsx` — add a static fallback block inside `RootShell`'s
  `<body>` (before `{children}`) with `id="bentako-boot"`, styled inline so it
  needs no CSS, plus a small inline `<script>` that hides it on successful
  hydration and handles `error` / `unhandledrejection` for chunk-load failures
  with a single `sessionStorage`-guarded cache-busting reload.
- `src/hooks/use-app-session.tsx` — `signOut()`: delete the snapshot, call
  `supabase.auth.signOut()` (existing timeout wrapper), then
  `window.location.replace("/auth?_bk=<ts>")`. Keep the snapshot-first order so a
  racing auth event cannot reopen the cached store.
- `src/components/app-shell.tsx`, `src/routes/_authenticated/more.tsx` — drop the
  `navigate({ to: "/auth" })` after `signOut()` (the hard load covers it); cancel
  and clear React Query caches via `useQueryClient()` before calling `signOut()`.
- `vite.config.ts` (Workbox) — add `/auth` to `navigateFallbackDenylist` and keep
  HTML `NetworkFirst`; no other caching changes.
- `src/routes/auth.tsx` — add a short timer that renders the form if
  `status === "loading"` persists, so the sign-in screen is never a spinner
  forever.

## Verification

- In the preview: sign in, sign out, confirm the sign-in form appears and sign in
  again reaching the dashboard.
- Simulate a failed startup (block an app file) and confirm the fallback panel
  plus one automatic reload appear instead of white.
