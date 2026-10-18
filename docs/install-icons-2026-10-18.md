# Install icons (2026-10-18)

## Root cause of "no icon" on installed app

`public/icons/icon-512.png` was actually an 816×816 image while the manifest
declared `512x512`. Android launchers validate declared sizes against the real
pixels and can ignore or drop mis-sized icons, leaving a blank/default icon.
The old 512 was also a different cream/orange illustration, not the BentaKo
shop mark used everywhere else.

## Fix

All icons are now generated from the established `src/assets/bentako-mark.png`
(white shop glyph on emerald):

- `public/icons/icon-192-v2.png` — 192×192, opaque, purpose `any`
- `public/icons/icon-512-v2.png` — 512×512, opaque, purpose `any`
- `public/icons/icon-maskable-512-v2.png` — 512×512 maskable; the mark is
  scaled to ~64% of the tile so it stays inside the central 80%-diameter safe
  circle on adaptive launchers
- `public/icons/apple-touch-icon.png` — 180×180 for iOS Add to Home Screen

Filenames are versioned (`-v2`) so caches fetch the new files; the manifest
`id`, `start_url` and `scope` are unchanged (`/`), so the app identity is
stable and no duplicate install is created.

## What this does and does not fix

- **Browser PWA installs (Chrome/Edge/Android, desktop):** new installs pick up
  the correct icon automatically. Already-installed PWAs may keep a cached icon
  until the OS/browser refreshes it — this resolves on its own; do NOT advise
  uninstalling or clearing site data, since that would erase offline records.
- **AppMint / SmartrixLabs wrapped APK:** the launcher icon of a wrapped APK is
  embedded in the APK itself by the wrapper builder. The web manifest does NOT
  control it. To change it, set the icon in the AppMint builder (or repackage)
  using `public/icons/icon-512-v2.png` and release an updated APK. Until then
  the wrapper's own default icon may still show.
