# Launch readiness — Step 1 only

## Delivered

- Shared Free/Pro descriptions and comparison rows distinguish Reports (Free 7 days, Pro up to 30), wallet logs (7/up to 30), Sales history (7/all-time), and Payments summaries (up to 30 on both).
- Export entitlement is false on both plans. Export and self-service cashier management remain unavailable. No invitations or export implementation was added.
- Basic offline receipts and compatible browser/Android print-service printing are available on both plans. Printing is not direct Bluetooth and depends on the printer service and wrapper support. Custom receipt logo/message are Pro-only; plain-text and structured receipts now agree.
- Pricing, Settings, reminders, dashboard promotion, device-limit guidance, Terms and Privacy use accurate descriptions. Public landing has no conflicting plan promises and was left unchanged.
- Manual billing uses expiry/no automatic renewal wording. Annual saving is ₱189 (about 16%).
- Eligible record sync is distinguished from device-only product/wallet photos and activity logs. No manual backup is promised. Settings shows **Last recorded sync**, not a claim of full successful backup: the existing timestamp can be recorded after partial pulls. Sync implementation was not changed.
- Free viewing limits do not delete older records. Existing wallet photos remain viewable/saveable/shareable after downgrade. New/replacement wallet photos require Pro at the picker, historical-row action and local mutation boundary; wrong-store/missing entries reject photo writes.
- Product creation, duplicate and restore enforce the same 60-active-product Free limit; product creation capacity is serialized. Existing over-limit products are not erased; editing remains possible. Sample-product addition stops at capacity.
- Onboarding uses the default Free receipt message instead of asking for an unhonored custom message. Deletion warns export/manual backup are not available.
- Missing leaf social metadata fields were completed without changing page workflows.

## Retained limits

₱99 monthly / ₱999 yearly; Free 60 active products and 1 device; Pro unlimited active products, 3 devices and 2 cashier seats; 14-day inclusive grace. Retained Pro history entitlements remain unlimited, separate from current 30-day Report/wallet screens. No device/cashier registration logic, database schema, production records, subscriptions, caching or native printer implementation changed.

## Verification

- `bunx vitest run`: **87 tests passed, 8 files**, final run started 2026-10-15 00:57:06 UTC. Tests use isolated fake IndexedDB and no production requests. Added retained-price/limit/grace, export availability, concurrent capacity, duplicate/restore/sample-product, wallet-photo entitlement/store scope/read preservation, and receipt plan enforcement cases.
- `bunx eslint` on all changed TS/TSX files: **0 errors, 1 pre-existing fast-refresh warning** in the session provider.
- `git diff --check`: passed.
- Automatic preview validation: **build OK**, latest observed entry **2026-10-15 00:57:24 UTC**. No manual build or separate typecheck command was run; validation relies on the automatic project checks.
- `python3 /tmp/browser/plan-accuracy/check_pricing.py`: passed with a synthetic cached owner/store in a fresh browser, external requests blocked and network reported offline. Mobile 360×800 and desktop 1366×900 have no horizontal overflow or page errors; yearly selection updates CTA to ₱999/year; both prices are readable; Free wallet Add-photo action is absent; Settings reads back the accurate Free summary.
- Screenshots reviewed: `/tmp/browser/plan-accuracy/mobile-pricing.png`, `mobile-comparison.png`, and `desktop-pricing.png`. The comparison screenshot is an element capture; the desktop capture shows the lower comparison/checkout section after scrolling.

## Limits and later steps

No publishing, migration, real business-data writes, real subscription actions, physical printer test or APK compilation. Full-history Reports/wallet logs, export, manual backup and cashier invitation management remain future work. Existing sync completeness/timestamp limitations and product save queue/audit separation remain outside this focused pass.

Preview: https://id-preview--f37219cf-d7e0-4375-8643-93641ac4f07f.lovable.app/upgrade

## Changed paths

- `src/lib/{plan,repo,receipt}.ts`
- `src/hooks/use-app-session.tsx`
- `src/components/{app-shell,plan-reminder,device-gate}.tsx`
- `src/routes/_authenticated/{upgrade,settings,reports,dashboard,cash,payments,products,more,expenses,utang,utang.$customerId}.tsx`
- `src/routes/{onboarding,terms,privacy}.tsx`
- `tests/{plan,repo,receipt}.test.ts`
- `AGENTS.md`, `roadmap.md`, this report, and project requirement memory