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

Validation details are recorded below after the final checks.