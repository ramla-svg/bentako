# Change dashboard initials button → open Settings (not sign out)

## Goal
On the main dashboard, the circle button showing the user's initials (top-right of the brand header) currently signs the user out. Change it so tapping it goes to the **Settings** page instead. Sign-out must remain reachable elsewhere.

## Current behavior
- `src/components/app-shell.tsx` (brand header, ~lines 147–154): an initials `<button>` calls `handleSignOut()`.
- This button is only shown when `brand` is true — i.e. the dashboard.
- Sign-out is still available from: Settings bottom button (`src/routes/_authenticated/settings.tsx` ~line 570) and the More page (`src/routes/_authenticated/more.tsx`).

## Change
In `src/components/app-shell.tsx`, convert the brand-header initials button from a sign-out action into navigation to `/settings`:

1. Replace the `<button onClick={handleSignOut}>` with a TanStack `<Link to="/settings">` keeping the same styling (size, rounded-full, secondary background, initials text) and `aria-label="Account settings"`.
2. Keep the existing `initials` computation so the same two letters show.
3. Leave the non-brand header's `LogOut` button (inner screens) and the bell/alert button untouched.
4. `handleSignOut` stays defined and is still used by the non-brand header's sign-out button, so no dead code is introduced.

## Out of scope
- No changes to Settings page content, the More page, or the non-brand header sign-out button.
- No schema, data, or business-logic changes.

## Verification
- `bunx tsgo --noEmit -p tsconfig.json` passes.
- Playwright at authenticated `/dashboard`: tap initials → lands on `/settings`; confirm no sign-out occurred (still signed in).
- Confirm Settings still shows its bottom "Sign out" button.
