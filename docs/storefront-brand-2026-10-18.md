# Storefront branding — 18 October 2026

The approved Store Design 1 is recreated as editable flat geometry in
`src/assets/bentako-storefront.svg`. Shared `BrandMark` presents this source in
the app; the 512px raster `src/assets/bentako-mark.png` is derived from it.

Version 3 web install artwork:

- `public/icons/icon-192-v3.png` and `icon-512-v3.png`: opaque emerald, enlarged white storefront.
- `public/icons/icon-maskable-512-v3.png`: separately scaled storefront, inside the central 80%-diameter safe circle.
- `public/icons/apple-touch-icon-v3.png`: 180px Apple touch icon.
- `public/icons/favicon-32-v3.png` and `favicon-48-v3.png`: small browser icons.
- `public/favicon.png`: updated compatibility path, also used by the existing connectivity probe.

Manifest identity, start URL and scope remain `/`. Existing PNG/SVG precache
globs cover the new assets without changing the service worker. Old v2 assets
remain available for earlier installations. No forced update, site-data clearing
or uninstall is needed. The artwork occupies more of its tile; the OS controls
the launcher slot and existing installations may retain cached artwork.

Branding is updated in the landing header/footer and sample phone header,
login, onboarding lock-up, desktop sidebar, mobile branded header, install
guidance, startup fallback, loading and root error/not-found screens. Functional
store-field/home-navigation icons, monitor/phone install-button icons, and
merchant receipt logos are deliberately unchanged.

No established native icon-generation command exists in this project, so Android
launcher/splash resources are not regenerated in this focused web change.
AppMint/SmartrixLabs embeds its launcher icon in the APK: supply
`public/icons/icon-512-v3.png` to the builder and release an updated APK. Web
assets cannot replace that embedded icon. No Gradle build, wrapper build or
physical installation has been tested.

## Validation

- `bunx vitest run`: 98 tests passed across 10 files, including eight install-icon tests (sizes, opacity, stable identity, enlarged foreground bounds, safe-circle containment, favicons).
- `bunx eslint src/components/brand-mark.tsx src/components/app-shell.tsx src/components/public-landing.tsx src/components/install-prompt.tsx src/components/legal-page.tsx src/routes/auth.tsx src/routes/index.tsx src/routes/onboarding.tsx src/routes/__root.tsx tests/install-icons.test.ts`: passed without warnings/errors.
- `git diff --check`: passed.
- Automatic preview validation: latest build signal `build OK`; no manual build/typecheck command was run (the environment runs them automatically).
- `python /tmp/browser/brand/check_brand.py`: passed at 360×800 and 1366×900; landing header, install guidance, login and disposable cached-session dashboard branding rendered, no horizontal overflow or page errors. External requests were blocked; no production account/data was used.
- All seven PNG compatibility/current icon URLs returned HTTP 200 with `image/png`; canonical SVG returned 200 with `image/svg+xml`.
- Icon montage reviewed at 32px, 48px and larger sizes. Auth mark 72px, mobile/sidebar/landing mark 44px, install mark 48px. Essential maskable pixels fit the central safe circle.
- Every content route inspected for title/description/Open Graph/Twitter metadata; no missing fields found.

Screenshots are under `/tmp/browser/brand/`: montage, 360/1366 landing headers,
login, dashboard and install dialog. Real OS installation and native launcher
appearance remain unverified. Onboarding/startup/error marks were checked in
source, not driven through their error/setup flows. Installer button symbols
remain functional monitor/phone symbols, with no duplicate install logic.

Changed source/config paths: `AGENTS.md`, `roadmap.md`,
`src/assets/bentako-storefront.svg`, `src/assets/bentako-mark.png`,
`src/components/brand-mark.tsx`, `src/components/app-shell.tsx`,
`src/components/public-landing.tsx`, `src/components/install-prompt.tsx`,
`src/components/legal-page.tsx`, `src/routes/auth.tsx`, `src/routes/index.tsx`,
`src/routes/onboarding.tsx`, `src/routes/__root.tsx`, `src/styles.css`,
`public/manifest.webmanifest`, `public/favicon.png`, the seven v3 icon PNGs
listed above, `tests/install-icons.test.ts`, and this report.

Preview: https://id-preview--f37219cf-d7e0-4375-8643-93641ac4f07f.lovable.app
No publishing, business-data writes, plan/workflow changes or receipt logo
changes were performed. Commits are managed automatically by the environment.