# SariPOS — Phase 1 Plan

An offline-first, mobile-first POS for Philippine sari-sari stores. Sales work with no internet and sync to the cloud automatically when it returns. Built so it can later be wrapped as an Android APK.

## What you get in Phase 1

- **Onboarding wizard**: store name, owner name, currency (₱ PHP default), optional logo, optional starter products (or skip).
- **Login**: email/password accounts with Owner and Cashier roles. Owner sees money/profit; cashier sees a simplified dashboard. PIN-unlock screen is prepared but not enabled.
- **Dashboard**: today's sales, transactions, estimated gross profit, expenses, low-stock count, inventory value, pending-sync count, recent transactions, and shortcuts (New Sale, Add Product, Stock In, Add Expense).
- **POS**: search by name/SKU/barcode, category chips, product cards with price + stock, cart bottom sheet with qty edit/remove, quick-cash buttons (Exact, 20, 50, 100, 200, 500, 1000) or custom amount, huge CHANGE display, cash-only checkout, then a printable/shareable receipt.
- **Products**: full CRUD with archive-instead-of-delete, duplicate-product action, cost vs selling price with auto profit-per-unit, unit types (piece default), low-stock threshold.
- **Inventory**: stock status list (In Stock / Low / Out), Stock In, Stock Adjustment with reasons. Every change writes an inventory movement record — stock is never silently edited.
- **Sales history**: filterable list (Today, Yesterday, Week, Month, Custom), detail view, owner-only Void with confirmation, stock restore, and an audit entry. Voided sales are kept, never deleted.
- **Expenses**: create/edit/view/archive with the 10 categories, works offline.
- **Reports**: sales summary, estimated gross profit, expenses, estimated net, top sellers, sales by category, daily sales, low stock.
- **Settings**: store profile & branding (name, logo, currency), receipt footer ("Maraming salamat po!"), POS rules (low-stock default, allow negative stock — OFF by default, require void confirmation), offline & sync panel with Sync Now, data export, user list.
- **Connection chip** in the header: Online / Offline / Syncing / N Pending. Never blocks checkout.
- **PWA**: manifest, icons, theme, cached app shell so the app opens reliably offline.

## How offline works

Every action writes to the on-device database first and the screen updates instantly — nothing waits on the network. Each record carries a UUID, timestamps, and a sync status of pending / synced / failed. A background sync service watches the connection, drains a queue, retries failures, and uses the UUID so a retry can never create a duplicate sale. Reads always come from local data, so there are no endless spinners offline.

## Technical section

- **Local layer**: Dexie (IndexedDB) stores for products, categories, sales, sale_items, inventory_movements, expenses, sync_queue, settings. Access is behind a `localDb` service interface so a Capacitor SQLite driver can be swapped in later.
- **Services**: `localDatabaseService`, `cloudDatabaseService`, `syncService`, `networkService`, plus feature-level services (pos, inventory, reports). UI never talks to Supabase directly.
- **Cloud**: Lovable Cloud (Supabase). Tables per the spec: profiles, stores, categories, products, sales, sale_items, inventory_movements, expenses, audit_logs — plus forward-compatible nullable columns/enums for the future Cash In/Cash Out module (provider, reference_number, wallet/cash before-after, service_fee) and customers/utang tables created but not surfaced in the UI. Every public table gets explicit GRANTs, RLS enabled, and store-scoped policies via a `has_role` security-definer function; roles live in a separate `user_roles` table.
- **Sync**: upserts keyed on client-generated UUID (idempotent), `updated_at` last-write-wins, queue with retry_count/last_error.
- **Transaction numbers**: `SP-YYYYMMDD-NNNN` for display only; UUID is the identity.
- **Formatting**: `₱1,250.00`, dates as `Sep 2, 2026 8:35 PM`.
- **Capacitor readiness**: no web-only assumptions in the data layer; thin adapters stubbed for camera/barcode, Bluetooth printing, filesystem, share.
- **Mobile**: bottom nav (Dashboard, POS, Products, Sales, More) with a prominent POS button; tables become cards on small screens; large touch targets.

## Build order

1. Cloud enable + schema, RLS, roles, seed categories.
2. Local Dexie layer + sync engine + connection indicator.
3. Auth, roles, onboarding wizard.
4. POS + checkout + receipt (the core loop).
5. Products, Inventory, movements.
6. Sales history, void, audit.
7. Expenses, Reports, Settings.
8. PWA + offline test pass: sell offline, reload, confirm persistence, reconnect, confirm single synced sale.

Not built now (architecture only): Cash In/Cash Out, GCash/Maya, utang/customers, suppliers, barcode hardware, thermal printing, multi-store.

## Design

Before building the UI I'll show you three rendered design directions to pick from (simple, friendly, high-contrast numbers), since no specific palette or font was given.
