# BentaKo desktop workspace — preview candidate

## Delivered
- Shell expands to 1440px with persistent desktop sidebar including GCash/E-wallet, Utang/Customers and Payments.
- Desktop POS at 1024px and above has a 360–380px persistent review panel. One shared review component is mounted either here or in the existing mobile sheet; cart/payment state stays in the page across resizing.
- Review details scroll independently; checkout/clear remain outside that scroll area. Long cart items have their own scroll area. Quantity increase retains stock enforcement.
- Ctrl/Cmd+K and bare slash focus product search, excluding text entry, composition/repeat and modal dialogs; barcode Enter matching retained. No keyboard checkout added.
- Dashboard has desktop multi-column summaries/actions/recent activity. Product rows align names/prices/stock/actions, inventory actions sit beside stock, sales rows expose payment/status. Mobile keeps its compact presentation.

## Validation actually run
- `bunx vitest run`: 59 passed, six test files; includes three new keyboard behavior tests.
- `bunx eslint src/hooks/use-desktop.ts src/lib/pos-keyboard.ts tests/pos-keyboard.test.ts src/components/app-shell.tsx src/routes/_authenticated/{pos,dashboard,products,inventory,sales}.tsx`: exit 0, no output.
- `git diff --check`: exit 0.
- Harness automatic typecheck/build: latest signal `build OK`, 2026-10-13T23:53:11Z. Manual typecheck/build commands were not run because project harness owns those checks.
- `python3 /tmp/browser/desktop/check_workspace.py`: passed. Fresh browser, cached synthetic store session and IndexedDB fixtures only; all non-localhost network requests blocked, navigator offline. No production reads/writes. No browser page errors.
- Browser checks: add/increase/decrease/remove, stock limit, disabled insufficient-cash checkout, cash completed exactly once under double click, persisted sale count, selected Utang customer with balance readback, POS structured print action (stubbed browser print), barcode Enter fill, text-safe shortcut, cart/cash continuity during 1366→360→1366 resize, one cash input and no desktop sheet dialog, 22-item cart including long product name and ₱1,234,567.89 price, checkout within 768px height.
- POS overflow checked at 1024/1440/360 widths. Dashboard/products/inventory/sales visually checked at 1440 and 360 after heading rendered. Screenshots stored under `/tmp/browser/desktop/`.

## Changed paths
- `src/components/app-shell.tsx`
- `src/routes/_authenticated/{pos,dashboard,products,inventory,sales}.tsx`
- `src/hooks/use-desktop.ts`
- `src/lib/pos-keyboard.ts`
- `tests/pos-keyboard.test.ts`
- `AGENTS.md`, `roadmap.md`, this report

## Limits / safety
Nothing published. Landing/install/PWA files, local database schema, cloud sync/auth, pricing/entitlements and receipt/printing implementation unchanged. Browser test snoozed the existing install invitation only in its disposable local storage to avoid interrupting checkout. No native/APK web-assets build, Gradle compile, physical printer/device, Windows executable or real Chrome installed-PWA check performed. Real signed-in cloud flow deliberately not exercised because fixtures were required and production writes prohibited. Existing hosted security findings remain outside this presentation scope. Credit cost unavailable.

Preview: https://id-preview--f37219cf-d7e0-4375-8643-93641ac4f07f.lovable.app
Latest observed autosaved code commit before this documentation update: `d4d6b97d61ad371f66d874fa12d33d3e51c41cc9`; agent does not create commits (platform-managed).
