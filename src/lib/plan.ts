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
  /** How far back reports and sales history may look. */
  reportDays: number;
  cloudBackup: boolean;
  export: boolean;
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
    branding: true,
  },
  pro: {
    products: Number.POSITIVE_INFINITY,
    devices: 3,
    cashiers: 2,
    reportDays: Number.POSITIVE_INFINITY,
    cloudBackup: true,
    export: true,
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
export function canAddProduct(
  store: PlanFields | null | undefined,
  activeCount: number,
): boolean {
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
