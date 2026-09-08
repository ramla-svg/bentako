# Invite Android visitors to install BentaKo

## What changes for you

1. **A polite install invitation.** After a customer has been in BentaKo for about 12 seconds (or as soon as they land on the dashboard after signing in), a bottom sheet slides up with the BentaKo icon, the headline "Install BentaKo", the line "Add BentaKo to your phone for faster access and an app-like experience.", and four benefits: opens from the home screen, faster access to the transaction log, keeps working offline, no Play Store needed. Buttons: **Install BentaKo** and **Maybe Later**.

2. **Never pushy.** It never appears on first paint, never fires the browser's own dialog on its own, and only ever appears once per visit. "Maybe Later" hides it for 7 days on that phone. Once BentaKo is installed and opened from the home-screen icon, the invitation never appears again.

3. **iPhone / iPad.** Instead of an install button that does nothing, Safari users see "Install BentaKo on iPhone" with the three steps: tap Share, choose Add to Home Screen, tap Add. Only shown when it is not already running as an installed app.

4. **Settings stays the permanent home for it.** The existing "Install BentaKo" card is reworked to always say the right thing: an Install button when the phone supports it, "BentaKo is installed" when it already is, the iPhone steps on Safari, and plain manual instructions on any other browser.

Nothing else changes: sign-in, saved sales, stock, offline use, sync and the current look all stay exactly as they are.

## Technical notes

- `src/lib/platform/install-service.ts`: keep the existing deferred-event capture, `canInstall`, `promptInstall`, `useInstallState`. Add to `useInstallState` an `os` field and an `iosInstructions` flag, plus `appinstalled`/`display-mode` change handling it already has. Add dismissal helpers backed by `localStorage` (`bentako_install_dismissed_until`, 7 days) and a `sessionStorage` "shown this session" flag.
- New `src/components/install-prompt.tsx`: a `Sheet` (bottom side) rendered once from `src/routes/__root.tsx` next to `<UpdateBanner />`. It self-suppresses when `isStandalone() || isNative()`, when dismissed within 7 days, when already shown this session, and (for Android) when no `beforeinstallprompt` event has arrived. Timer: 12s after mount; an additional immediate trigger when the current route is `/dashboard`. Install path calls `promptInstall()` and closes on `accepted`/`dismissed`; iOS path renders the three Safari steps with a single "Got it" button.
- `src/routes/_authenticated/settings.tsx`: extend the existing Install section with the installed / available / iOS / unsupported branches. No other section touched.
- Manifest and icons are already correct (`name`, `short_name`, `display: standalone`, `start_url: /`, brand `theme_color`/`background_color`, 192 + 512 + maskable) — audit only, no change expected beyond re-checking icon sizes.
- Service worker config in `vite.config.ts` is left untouched so offline behaviour and update prompts are unaffected.
- Verify with a production-style build at 360 / 390 / 768 px: prompt hidden on load, appears after the delay, "Maybe Later" persists, standalone mode suppresses it, Settings branches render, and offline start-up still works. Run `bunx tsgo --noEmit`.
