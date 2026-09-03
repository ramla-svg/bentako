# BentaKo

Build a complete, production-style, mobile-first Sari-Sari Store POS Web App designed specifically for small neighborhood stores in the Philippines.

The application must be simple enough for a sari-sari store owner with little technical experience, fast to operate, clean, touch-friendly, and capable of continuing basic POS operations even when there is no internet connection.

The project must be designed from the beginning so it can later be packaged as an Android APK using Capacitor.

PROJECT NAME: For now call the application:

SariPOS

Make the application name, logo, store name, theme, and branding editable later in Settings.

================================================== CORE PRODUCT GOAL

Create a Point of Sale and inventory application for Philippine sari-sari stores.

The app must allow the owner or cashier to:

Add and manage products

Sell products quickly

Calculate change

Deduct inventory automatically

Record daily sales

Record expenses

View basic profit estimates

View low-stock products

Work offline

Sync data to the cloud when internet returns

Use the app comfortably on Android phones and tablets

Later package the same application using Capacitor as an APK

Do not build Cash In / Cash Out yet.

However, prepare the architecture so that a future module called:

Cash In / Cash Out

can later support:

GCash Maya Bank transfers Remittance Service fees Wallet balances Reference numbers Daily reconciliation

Do not implement those features yet.

================================================== TECH STACK

Use the existing Lovable-compatible stack.

Preferred:

React TypeScript Vite Supabase Tailwind CSS shadcn/ui

Use Supabase for cloud data storage.

Use an OFFLINE-FIRST architecture.

Do not make the POS depend entirely on live Supabase requests.

For local offline storage, use:

IndexedDB

Prefer Dexie.js if appropriate.

The POS must remain operational even when the device loses internet connection.

Create the architecture so that the local storage layer can later be upgraded or adapted to SQLite when packaged through Capacitor.

================================================== CRITICAL OFFLINE REQUIREMENT

This is extremely important.

The application must not stop working just because there is no internet.

The following must still work offline:

Open POS page

Browse existing products

Search existing products

Add products to cart

Change quantities

Remove products from cart

Checkout sale

Calculate payment and change

Save transactions locally

Deduct inventory locally

View locally available sales history

Record expenses

View current local inventory

View basic locally-calculated dashboard totals

When offline:

Save all new records locally first.

Assign each locally-created record:

local_id created_at updated_at sync_status

Possible sync_status:

synced pending failed

When internet becomes available:

Automatically attempt to sync pending records with Supabase.

After successful synchronization:

Change sync_status to:

synced

Avoid creating duplicate sales when synchronization retries.

Every important transaction should have a unique UUID.

Build conflict-safe synchronization logic.

The UI should display a small connection indicator such as:

Online Offline Syncing Pending Sync

Do not annoy the cashier with large warnings.

The POS should simply continue working.

================================================== DATA FLOW

Use the following concept:

User action → save locally first → update UI immediately → attempt cloud sync → if sync succeeds mark synced → if internet unavailable remain pending → automatically retry later

Do not make the cashier wait for Supabase before completing a sale.

================================================== AUTHENTICATION

Create a simple authentication system.

Use Supabase Auth.

Roles:

Owner Cashier

Owner has full access.

Cashier can:

Use POS

View permitted sales

Record expenses if allowed

Cashier should not automatically have access to sensitive settings.

Create role-based access control.

Also prepare the interface for a future quick PIN unlock.

================================================== ONBOARDING

When a new store opens the app for the first time, provide a short setup wizard.

Step 1: Store Name

Step 2: Owner Name

Step 3: Currency

Default: Philippine Peso PHP ₱

Step 4: Optional store logo

Step 5: Starting product setup

Allow:

Add manually Skip for now

After setup go to Dashboard.

================================================== MAIN NAVIGATION

Create these primary sections:

Dashboard POS Products Inventory Sales Expenses Reports Settings

On mobile use a clean bottom navigation for the most commonly used pages.

Suggested mobile bottom navigation:

Dashboard POS Products Sales More

The POS button should be visually prominent.

================================================== DASHBOARD

Create a simple dashboard.

Show:

Today's Sales

Today's Transactions

Estimated Gross Profit

Expenses Today

Low Stock Items

Current Inventory Value

Pending Offline Sync

Also show a simple recent transaction section.

Use readable cards.

Do not overcrowd the dashboard.

Include shortcuts:

New Sale Add Product Stock In Add Expense

================================================== POS SCREEN

This is the most important screen.

Design it for fast touch interaction.

On mobile:

Top area: Search products

Search should work using:

Product name SKU Barcode

Add category filter buttons.

Examples:

All Drinks Snacks Canned Goods Noodles Coffee Toiletries Household Cigarettes Other

Create product cards with:

Product name Price Current stock

Optional product image.

Clicking product adds it to cart.

Provide a compact cart drawer or bottom sheet.

Cart must show:

Product Quantity Price Subtotal

Controls:

Remove

Allow manual quantity entry if needed.

================================================== QUICK SELLING

Sari-sari store owners sell many inexpensive products.

Make checkout extremely fast.

Provide quick cash buttons.

Example:

Exact ₱20 ₱50 ₱100 ₱200 ₱500 ₱1000

Also allow custom cash amount.

Show clearly:

Total Cash Received Change

Example:

TOTAL ₱76.00

CASH ₱100.00

CHANGE ₱24.00

Make the change amount large and highly visible.

================================================== CHECKOUT

For Phase 1 payment types:

Cash

Also prepare the data structure so payment methods can later support:

GCash Maya Bank Other

But do not implement them yet.

When Checkout is confirmed:

Generate transaction UUID

Create sale record locally

Create sale item records locally

Deduct quantities locally

Update dashboard

Clear cart

Show receipt summary

Attempt cloud synchronization

Checkout must not fail simply because internet is unavailable.

================================================== RECEIPT

Create a simple digital receipt.

Receipt fields:

Store Name Transaction Number Date Time Cashier

Purchased Items

Qty Item Price Subtotal

Total Cash Received Change

Create buttons:

New Sale Print Share

Printing can initially use browser printing.

Prepare architecture for future Bluetooth thermal printer support through Capacitor.

================================================== PRODUCT MANAGEMENT

Products page must support full CRUD.

Create product View products Edit product Archive product

Avoid deleting products permanently if they already belong to previous sales.

Product fields:

id store_id name description category_id sku barcode cost_price selling_price stock_quantity low_stock_threshold unit_type image_url is_active created_at updated_at sync_status

Unit types:

piece pack sachet bottle can box kilo gram liter ml other

Default should be:

piece

================================================== PRODUCT PRICING

Store both:

Cost Price

Selling Price

Automatically calculate:

Profit per unit

Example:

Cost: ₱8

Selling: ₱10

Profit: ₱2

Use this for basic profit reporting.

================================================== INVENTORY

Create an Inventory page.

Show:

Product Current Stock Low Stock Threshold Status

Statuses:

In Stock Low Stock Out of Stock

Create Stock In functionality.

Fields:

Product Quantity Added Cost if applicable Supplier optional Notes optional Date

Create Stock Adjustment.

Reasons:

Damaged Expired Personal Use Lost Correction Other

Every inventory change should create an inventory movement record.

Never simply modify stock without creating a record.

================================================== INVENTORY MOVEMENT TYPES

Create these movement types:

stock_in sale adjustment_add adjustment_remove damaged expired returned

Prepare architecture for future:

cashout_related supplier_purchase

================================================== SALES HISTORY

Create a Sales page.

Show transaction list.

Columns or cards:

Transaction Number Date Time Items Total Cashier Sync Status

Allow filters:

Today Yesterday This Week This Month Custom Date

Allow opening transaction details.

Transaction details should show:

Products purchased Quantities Prices Total Cash received Change Cashier Timestamp

================================================== VOID / CANCEL

Owner should be able to void a transaction.

Require confirmation.

Do not permanently delete the transaction.

Set status:

voided

Restore stock quantities when appropriate.

Create an audit record.

================================================== EXPENSES

Create Expenses module.

Fields:

Expense Title Category Amount Notes Date Cashier/User

Categories:

Inventory Purchase Transportation Electricity Water Rent Food Maintenance Supplies Other

Allow:

Create Edit View Archive

Expenses should also work offline.

================================================== REPORTS

Create basic reports.

Sales Summary

Gross Sales

Number of Transactions

Average Sale

Estimated Gross Profit

Expenses

Estimated Net Result

Top Selling Products

Low Stock Products

Sales by Category

Daily Sales

Do not create advanced accounting.

Clearly label profit calculations as:

Estimated Gross Profit

Formula:

Selling Price - Cost Price

================================================== SARI-SARI SPECIFIC FEATURES

Create product support suitable for common sari-sari store items.

Examples:

Soft drinks Coffee sachets Instant noodles Canned goods Candy Biscuits Soap Shampoo sachets Cigarettes Rice Eggs Bread Ice Load products later

Make product creation fast.

Provide:

Duplicate Product

This allows the owner to quickly create similar products.

Example:

Coke Mismo Coke 1.5L Coke Can

================================================== LOW STOCK

Each product should have:

low_stock_threshold

Example:

Current Stock: 3

Low Stock Threshold: 5

Display:

LOW STOCK

Provide a dashboard section showing low-stock products.

================================================== CUSTOMER / UTANG PREPARATION

Do not fully implement customer credit yet.

However, design the database so a future module can support:

Customers Utang Credit purchases Partial payments Balances Payment history

Do not display this module in the main navigation yet.

================================================== FUTURE CASH IN / CASH OUT PREPARATION

Prepare architecture for a later module.

Future transaction types:

cash_in cash_out

Future service providers:

GCash Maya Bank Remittance Other

Future fields:

provider customer_name customer_mobile_number amount service_fee reference_number wallet_before wallet_after cash_before cash_after status

Do not build this UI yet.

Keep Phase 1 focused on POS.

================================================== DATABASE SCHEMA

Create database tables approximately like:

profiles

id full_name role store_id created_at

stores

id name owner_id logo_url currency created_at updated_at

categories

id store_id name is_active created_at updated_at

products

id store_id category_id name description sku barcode cost_price selling_price stock_quantity low_stock_threshold unit_type image_url is_active created_at updated_at

sales

id store_id transaction_number cashier_id subtotal discount total payment_method cash_received change_amount status created_at updated_at

sale_items

id sale_id product_id product_name_snapshot quantity cost_price_snapshot selling_price_snapshot subtotal created_at

inventory_movements

id store_id product_id movement_type quantity previous_stock new_stock reference_id notes created_by created_at

expenses

id store_id title category amount notes expense_date created_by created_at updated_at

sync_queue

id entity_type entity_id operation payload status retry_count last_error created_at updated_at

audit_logs

id store_id user_id action entity_type entity_id metadata created_at

================================================== LOCAL DATABASE

Mirror required working data into IndexedDB.

Create local tables or stores for:

products categories sales sale_items inventory_movements expenses sync_queue settings

The POS should read from the local database first.

Cloud synchronization should happen separately.

================================================== SYNC ENGINE

Create a reusable synchronization service.

Example structure:

localDatabaseService cloudDatabaseService syncService networkService

The sync service should:

Detect online state.

Process pending sync queue.

Retry failed requests.

Avoid duplicate uploads.

Update local records after successful sync.

Log failures.

Do not block the cashier.

================================================== CONNECTION STATUS

Create a subtle app header or status indicator.

States:

Online

Offline

Syncing

3 Pending

When offline, show something like:

Offline Mode Sales will sync automatically when connection returns.

Do not prevent checkout.

================================================== PWA

Make the application installable as a Progressive Web App where possible.

Add:

manifest application icons app name theme settings service worker if appropriate

Cache application shell and essential assets.

The purpose is to make startup more reliable even without internet.

================================================== CAPACITOR READINESS

Structure the application so it can later be packaged with Capacitor.

Avoid web-only assumptions that would prevent Android packaging.

Prepare services so later we can add:

Capacitor SQLite Camera Barcode scanner Bluetooth Thermal printing Push notifications Biometric authentication Filesystem Share API

Do not implement unnecessary native features yet.

================================================== RESPONSIVE DESIGN

Priority devices:

Android phone Android tablet

Also support:

Laptop Desktop

Mobile-first.

Use large touch targets.

Minimum comfortable button size.

Avoid tiny text.

Avoid complex desktop-style tables on small screens.

Convert tables to cards where necessary.

================================================== DESIGN DIRECTION

Design should feel:

Simple Reliable Modern Friendly Professional

Not:

Corporate Overly technical Overdecorated Futuristic Cluttered

Use generous spacing.

Use readable typography.

Use icons sparingly.

Make important numbers easy to read.

Checkout should require as few taps as possible.

================================================== EMPTY STATES

Create good empty states.

Example Products:

No products yet.

Add your first product to start selling.

[Add Product]

Example Sales:

No sales recorded today.

Start a new sale from the POS.

[New Sale]

================================================== LOADING STATES

Use skeleton loaders where appropriate.

However, when offline and local data exists, show local data immediately rather than showing endless loading states.

================================================== ERROR HANDLING

Never expose technical database errors directly to the cashier.

Use readable messages.

Example:

Could not sync this transaction yet.

It has been safely saved on this device and will sync automatically later.

================================================== SECURITY

Use Supabase Row Level Security.

Each store should only access its own information.

Users should only access stores they belong to.

Cashier permissions must be limited based on role.

Do not store sensitive credentials directly in frontend code.

================================================== AUDIT LOGGING

Record important actions.

Examples:

Product edited Stock adjusted Sale voided Expense edited User permissions changed

Store:

User Action Entity Timestamp

================================================== TRANSACTION NUMBER FORMAT

Generate readable transaction numbers.

Example:

SP-20260902-0001

Use date plus sequential or safe unique identifier.

Do not rely only on the local sequential number for synchronization identity.

Use UUID as the actual primary identifier.

================================================== CURRENCY

Default currency:

₱ PHP

Format money correctly.

Example:

₱1,250.00

================================================== DATE / TIME

Store timestamps safely.

Display local Philippine-friendly formatting.

Example:

Sep 2, 2026 8:35 PM

================================================== DEMO DATA

Provide optional sample products during development.

Examples:

Coke Mismo ₱20

Lucky Me Pancit Canton ₱15

Nescafé 3-in-1 ₱8

Egg ₱10

SkyFlakes ₱9

Shampoo Sachet ₱7

Mineral Water ₱15

Sardines ₱25

Do not permanently force demo data into production accounts.

================================================== SETTINGS

Create Settings page.

Sections:

Store Profile

Store Name Owner Name Logo Currency

Receipt Settings

Store Name Footer Message

Example:

Maraming salamat po!

POS Settings

Low Stock Defaults Allow Negative Stock Require Confirmation for Void

Offline & Sync

Connection Status Last Successful Sync Pending Records Sync Now

Data

Export Data Backup status

Users

Owner Cashiers

================================================== NEGATIVE STOCK

By default:

Do not allow selling more units than available stock.

Provide an Owner setting:

Allow Negative Stock

Default:

OFF

================================================== OWNER DASHBOARD

Owner should see more financial information than cashier.

Owner:

Sales Profit Expenses Inventory Value Low Stock

Cashier dashboard can be simplified.

================================================== PERFORMANCE

The POS should feel instant.

Product search must be fast.

Cart operations must happen locally without server latency.

Do not refetch the entire database after every transaction.

Use efficient local state updates.

================================================== FUTURE ROADMAP PREPARATION

Keep the project modular.

Future modules may include:

Cash In / Cash Out GCash Maya Utang / Customer Credit Customer Accounts Suppliers Purchase Orders Barcode Scanning Bluetooth Receipt Printer Multi-Store Multiple Cashiers Employee Time Logs SMS Receipts Analytics Cloud Backup Subscription Plans APK distribution

Do not implement all of these now.

Only design clean architecture so they can be added later.

================================================== PHASE 1 PRIORITY

The first working release should prioritize:

Offline POS

Products

Inventory

Checkout

Cash and Change

Sales History

Expenses

Basic Reports

Offline synchronization

Mobile usability

Avoid feature creep.

================================================== IMPORTANT DEVELOPMENT RULE

Do not build placeholder-only buttons.

Every visible primary action should work.

If a future feature is not implemented, do not show a misleading active button.

Do not create a fake offline mode.

Actually implement local persistence.

Test the core scenario:

Load app while online.

Products synchronize locally.

Turn off internet.

Add products to cart.

Complete sale.

Inventory updates locally.

Sale appears in local history.

Close and reopen app.

Sale and updated stock are still available.

Restore internet.

Pending sale synchronizes to Supabase.

No duplicate transaction is created.

This workflow is mandatory.

================================================== FINAL UX GOAL

A sari-sari store owner should be able to open the app and immediately understand:

Tap product Enter payment See change Complete sale

The app should feel faster than writing transactions in a notebook.

Keep the POS interface extremely simple while keeping the underlying architecture robust.

Build the project in a modular way.

After generating the first version, inspect the application for incomplete buttons, broken navigation, missing database operations, offline weaknesses, and mobile layout problems, and correct them before considering Phase 1 complete.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bentako.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f37219cf-d7e0-4375-8643-93641ac4f07f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
