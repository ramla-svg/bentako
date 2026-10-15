/**
 * BentaKo plans.
 *
 * Free = the whole shop runs on the phone.
 * Pro  = records are backed up off the phone, and the shop can grow.
 *
 * The active plan is read from the cached store snapshot, so limits are correct
 * offline. An expired subscription keeps working for GRACE_DAYS so a store with
 * no signal is never downgraded in the middle of a selling day.
 */

export type PlanId = "free" | "pro";
export type PlanPeriod = "monthly" | "yearly";

export const GRACE_DAYS = 14;

export const PRO_PRICE_MONTHLY = 99;
export const PRO_PRICE_YEARLY = 999;

export interface PlanLimits {
  /** Maximum active products; Infinity = no limit. */
  products: number;
  devices: number;
  cashiers: number;
  /** Retained history entitlement; available report ranges are defined below. */
  reportDays: number;
  cloudBackup: boolean;
  export: boolean;
  /** true = the shop can attach a photo to each product. */
  productPhotos: boolean;
  /** true = GCash / e-wallet entries can keep a screenshot as proof. */
  walletPhotos: boolean;
  /** How far back the GCash & e-wallet list may look, in days. */
  walletHistoryDays: number;
  /** true = "Powered by BentaKo" stays on receipts. */
  branding: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    products: 60,
    devices: 1,
    cashiers: 0,
    reportDays: 7,
    cloudBackup: false,
    export: false,
    productPhotos: false,
    walletPhotos: false,
    walletHistoryDays: 7,
    branding: true,
  },
  pro: {
    products: Number.POSITIVE_INFINITY,
    devices: 3,
    cashiers: 2,
    reportDays: Number.POSITIVE_INFINITY,
    cloudBackup: true,
    export: false,
    productPhotos: true,
    walletPhotos: true,
    walletHistoryDays: Number.POSITIVE_INFINITY,
    branding: false,
  },
};

export interface PlanFields {
  plan?: string | null;
  plan_period?: string | null;
  plan_expires_at?: string | null;
  plan_source?: string | null;
}

/** Resolve the plan actually in force right now (expiry + grace applied). */
export function activePlan(store: PlanFields | null | undefined): PlanId {
  if (!store || store.plan !== "pro") return "free";
  if (!store.plan_expires_at) return "pro";
  const end = new Date(store.plan_expires_at).getTime();
  if (Number.isNaN(end)) return "pro";
  return Date.now() <= end + GRACE_DAYS * 86_400_000 ? "pro" : "free";
}

export function planLimits(store: PlanFields | null | undefined): PlanLimits {
  return PLAN_LIMITS[activePlan(store)];
}

export function isPro(store: PlanFields | null | undefined): boolean {
  return activePlan(store) === "pro";
}

/** True when another product still fits on the current plan. */
export function canAddProduct(store: PlanFields | null | undefined, activeCount: number): boolean {
  return activeCount < planLimits(store).products;
}

export function reportWindowDays(store: PlanFields | null | undefined): number {
  return planLimits(store).reportDays;
}

export function planLabel(plan: PlanId): string {
  return plan === "pro" ? "BentaKo Pro" : "Free";
}

/** Days left before Pro lapses; null when not applicable. */
export function daysLeft(store: PlanFields | null | undefined): number | null {
  if (!store?.plan_expires_at || store.plan !== "pro") return null;
  const end = new Date(store.plan_expires_at).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86_400_000);
}

/** Available screens, distinct from retained history entitlements. */
export const PLAN_AVAILABILITY = {
  reportDays: { free: 7, pro: 30 },
  walletLogDays: { free: 7, pro: 30 },
  paymentsSummaryDays: 30,
  cashierManagement: false,
} as const;
export const ANNUAL_SAVING = PRO_PRICE_MONTHLY * 12 - PRO_PRICE_YEARLY;
export const PLAN_SUMMARY: Record<PlanId, string> = {
  free: "Free: 60 active products, 1 device, 7-day reports and sales/GCash logs. Selling, basic offline receipts, cash and utang work on this device.",
  pro: "Pro: unlimited active products, 3 devices, up to 30-day reports and GCash logs, all-time sales history, and eligible record sync. 2 cashier seats; self-service cashier management is coming soon.",
};
export const LOCAL_DATA_NOTE = "Older records stay on this device; viewing limits do not delete them. Product and wallet photos and activity logs stay device-only, including on Pro. Existing photos remain viewable after downgrade. No manual backup or spreadsheet export is available yet.";
export const SYNC_DATA_NOTE = "Pro sync covers eligible sales, products, stock, cash, utang and expense records after successful upload. Product and wallet photos and activity logs are not uploaded.";
export const PRINT_NOTE = "Browser/Android print service; compatible printers only. Not direct Bluetooth printing. Printer-service and AppMint/wrapper support varies; test your setup first.";
export interface PlanComparisonRow { label: string; free: string | boolean; pro: string | boolean; soon?: boolean }
export const PLAN_COMPARISON: PlanComparisonRow[] = [
  { label: "Active products", free: "60", pro: "Unlimited" },
  { label: "Devices", free: "1", pro: "3" },
  { label: "Cashier seat limit", free: false, pro: "2" },
  { label: "Self-service cashier management", free: "—", pro: "—", soon: true },
  { label: "Eligible record cloud sync & restore", free: false, pro: true },
  { label: "Reports", free: "7 days", pro: "Up to 30 days" },
  { label: "Sales history", free: "7 days", pro: "All time" },
  { label: "Product photos (device-only)", free: false, pro: true },
  { label: "Selling, cash, utang & offline receipts", free: true, pro: true },
  { label: "GCash & e-wallet log", free: "7 days", pro: "Up to 30 days" },
  { label: "Wallet photos (device-only)", free: false, pro: true },
  { label: "Payments summary", free: "Up to 30 days", pro: "Up to 30 days" },
  { label: "Export to spreadsheet", free: "—", pro: "—", soon: true },
  { label: "Your logo & message on receipts", free: false, pro: true },
  { label: "Compatible print-service printing", free: true, pro: true },
];
