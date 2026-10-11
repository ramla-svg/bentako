# BentaKo public landing — 2026-10-11

## Scope
- Public logged-out browser root now shows the Tagalog-first landing page. Existing store sessions (including cached sessions) still go directly to `/dashboard`; store-less sessions go to `/onboarding`. Loading sessions retain the existing splash, preventing a marketing/auth flash.
- Installed PWA and Capacitor signed-out entry still opens `/auth`. Manifest start URL, app session provider, worker caching, native bridge, POS functionality, prices, plans, receipt fixes and stored records were not changed.
- Typed `/auth?mode=signup` links open the existing Create store tab; sign-in links explicitly select signin. Sample preview is a noninteractive HTML illustration with labelled synthetic values. GCash is presented as recording, not payment processing.
- The shop and owner photos are generated illustrative assets, not customer testimonials or real business claims. Landing-only colors and serif typography are scoped; existing app fonts are unchanged.
- Corrected a pre-existing router error-boundary prop type exposed by the current installed router, using its exported ErrorComponentProps. No error handling behavior changed.

## Evidence
- `bunx vitest run`: 49 tests passed in 4 files (6 added entry/auth-mode tests; 43 existing tests retained).
- `bunx eslint src/components/public-landing.tsx src/routes/index.tsx src/routes/auth.tsx src/routes/__root.tsx src/lib/landing-entry.ts tests/landing-entry.test.ts`: exit 0.
- Harness automatic typecheck and production build: latest `/tmp/observability/build-errors.log` reports `build OK`. No manual duplicate builds/typechecks were run, per workspace rules.
- Python Playwright `/tmp/browser/landing/check_landing.py`: desktop 1280px and mobile 360px; images loaded; no horizontal overflow; no page errors; both anchors and sample link work; signup opens name input; signin has no name input; Privacy and Terms navigate correctly; mobile menu closes on anchor selection.
- Synthetic isolated browser contexts, with external requests blocked: cached store session reached `/dashboard`, store-less snapshot reached `/onboarding`. No production accounts or records used.
- Python Playwright `/tmp/browser/landing/check_bottom.py`: lower banner opens signup on desktop/mobile; simulated standalone PWA signed-out entry reaches `/auth`. Capacitor browser emulation timed out (the library replaces the injected platform stub), so native entry is covered by the decision-unit test only, not verified end-to-end.
- Visually reviewed desktop/mobile screenshots of hero, sample, features, steps, lower banner and footer. Product thumbnail drawings avoid missing emoji glyphs.

## Limits
- APK web-assets build was not manually run: workspace instructions reserve builds/typechecks for the harness; its normal production build passed. No Gradle compile, signed APK, physical Android test or full published offline-shell test occurred.
- Browser offline-entry check blocks external services but serves assets from local dev; dev intentionally has no service worker. Fully offline installed-app reopen still needs a device check on a published release. Existing PWA configuration/start URL remain unchanged.
- Standalone PWA checks are simulated; native APK startup remains unverified without a real native shell.
- Root remains client-rendered to preserve current session boot behavior; text metadata is in route head and generated photos are relative bundled assets, so no fabricated absolute OG image is tagged.
- Nothing was deployed. Public live page and SEO change only on the next authorized publish.
