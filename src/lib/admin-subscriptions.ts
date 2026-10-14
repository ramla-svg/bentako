/**
 * Pure helpers for the private BentaKo owner screen: subscriber status,
 * approved subscription revenue and Pro removal. No network or database
 * access lives here, so every rule is testable with plain fixtures.
 */
import { GRACE_DAYS } from "@/lib/plan";

export type SubscriberStatus = "free" | "pro_active" | "pro_expired";

export interface AdminStoreRow {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string | null;
  plan: string;
  plan_period: string | null;
  plan_expires_at: string | null;
  plan_source: string | null;
  created_at: string;
}

export interface AdminPaymentRow {
  store_id: string;
  amount: number | string;
  status: string;
  plan_period: string;
  created_at: string;
  reviewed_at: string | null;
  requested_by_email: string | null;
}

/** Same rule the app uses for entitlement: expiry plus the grace window. */
export function subscriberStatus(
  store: Pick<AdminStoreRow, "plan" | "plan_expires_at">,
  now: number,
): SubscriberStatus {
  if (store.plan !== "pro") return "free";
  if (!store.plan_expires_at) return "pro_active";
  const end = new Date(store.plan_expires_at).getTime();
  if (Number.isNaN(end)) return "pro_active";
  return now <= end + GRACE_DAYS * 86_400_000 ? "pro_active" : "pro_expired";
}

export function toCents(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const MANILA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
});

/** "YYYY-MM" of an instant on the Asia/Manila calendar. */
export function manilaMonthKey(at: string | number | Date): string {
  const parts = MANILA.formatToParts(new Date(at));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y = 0, m = 1] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export interface AdminMetrics {
  totalStores: number;
  activePro: number;
  freeStores: number;
  expiredPro: number;
  activeMonthly: number;
  activeYearly: number;
  pendingPayments: number;
  approvedCount: number;
  approvedTotalCents: number;
  currentMonth: string;
  currentMonthCents: number;
  previousMonthCents: number;
  /** Oldest first, six calendar months ending with the current one. */
  trend: { month: string; cents: number }[];
  /** Approved rows with no approval time, dated by when they were sent. */
  fallbackDatedCount: number;
}

export function computeAdminMetrics(
  stores: AdminStoreRow[],
  payments: AdminPaymentRow[],
  now: number,
): AdminMetrics {
  let activePro = 0;
  let expiredPro = 0;
  let activeMonthly = 0;
  let activeYearly = 0;
  for (const s of stores) {
    const st = subscriberStatus(s, now);
    if (st === "pro_active") {
      activePro++;
      if (s.plan_period === "yearly") activeYearly++;
      else if (s.plan_period === "monthly") activeMonthly++;
    } else if (st === "pro_expired") expiredPro++;
  }

  const currentMonth = manilaMonthKey(now);
  const previousMonth = shiftMonth(currentMonth, -1);
  const trendKeys = [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(currentMonth, d));
  const byMonth = new Map<string, number>();
  let approvedTotalCents = 0;
  let approvedCount = 0;
  let pendingPayments = 0;
  let fallbackDatedCount = 0;

  for (const p of payments) {
    if (p.status === "pending") pendingPayments++;
    if (p.status !== "approved") continue;
    const cents = toCents(p.amount);
    approvedCount++;
    approvedTotalCents += cents;
    if (!p.reviewed_at) fallbackDatedCount++;
    const key = manilaMonthKey(p.reviewed_at ?? p.created_at);
    byMonth.set(key, (byMonth.get(key) ?? 0) + cents);
  }

  return {
    totalStores: stores.length,
    activePro,
    freeStores: stores.length - activePro - expiredPro,
    expiredPro,
    activeMonthly,
    activeYearly,
    pendingPayments,
    approvedCount,
    approvedTotalCents,
    currentMonth,
    currentMonthCents: byMonth.get(currentMonth) ?? 0,
    previousMonthCents: byMonth.get(previousMonth) ?? 0,
    trend: trendKeys.map((month) => ({ month, cents: byMonth.get(month) ?? 0 })),
    fallbackDatedCount,
  };
}

/** Read every row in pages so totals are never cut off by a row cap. */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

export function adminEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function assertAdminEmail(claims: Record<string, unknown>, allowed: string[]): string {
  const email = String(claims["email"] ?? "").toLowerCase();
  if (!email || !allowed.includes(email)) throw new Error("Forbidden");
  return email;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_REASON = 3;

export interface RevokeInput {
  storeId: string;
  reason: string;
  expectedExpiresAt: string | null;
}

export function validateRevokeInput(input: Partial<RevokeInput> | null | undefined): RevokeInput {
  const storeId = String(input?.storeId ?? "");
  if (!UUID.test(storeId)) throw new Error("Invalid store id");
  const reason = String(input?.reason ?? "")
    .trim()
    .slice(0, 300);
  if (reason.length < MIN_REASON) throw new Error("Please give a short reason");
  const exp = input?.expectedExpiresAt ?? null;
  if (exp !== null && Number.isNaN(new Date(exp).getTime())) throw new Error("Invalid expiry");
  return { storeId, reason, expectedExpiresAt: exp };
}

export type RevokeStatus = "revoked" | "already_free" | "stale" | "not_found";

export interface RevokeDeps {
  /** One database transaction: lock, re-check, downgrade, write the audit row. */
  revokeAtomic: (args: RevokeInput & { actorId: string; actorEmail: string }) => Promise<{
    status: string;
  }>;
}

export async function revokeStorePro(
  deps: RevokeDeps,
  claims: Record<string, unknown>,
  allowed: string[],
  actorId: string,
  raw: Partial<RevokeInput>,
): Promise<{ status: RevokeStatus }> {
  const actorEmail = assertAdminEmail(claims, allowed);
  const input = validateRevokeInput(raw);
  const result = await deps.revokeAtomic({ ...input, actorId, actorEmail });
  const status = result?.status;
  if (
    status === "revoked" ||
    status === "already_free" ||
    status === "stale" ||
    status === "not_found"
  ) {
    return { status };
  }
  throw new Error("Unexpected result");
}

/** UI gate for the confirmation dialog. */
export function canSubmitRevoke(reason: string, busy: boolean): boolean {
  return !busy && reason.trim().length >= MIN_REASON;
}

export interface AdminStoreListItem extends AdminStoreRow {
  status: SubscriberStatus;
  /** Email of the verified account that owns the store (stores.owner_id). */
  owner_email: string | null;
  /** Latest email that sent a GCash payment for this store; may differ from the owner. */
  payment_contact: string | null;
}

/** Join verified owner identity, filter and order for the admin list. */
export function buildStoreList(
  stores: AdminStoreRow[],
  payments: Pick<AdminPaymentRow, "store_id" | "requested_by_email" | "created_at">[],
  users: { id: string; email?: string | null }[],
  now: number,
  opts: { q: string; status: SubscriberStatus | null },
): AdminStoreListItem[] {
  const ownerEmail = new Map(users.map((u) => [u.id, u.email ?? null]));
  const contact = new Map<string, { email: string; at: string }>();
  for (const p of payments) {
    if (!p.requested_by_email) continue;
    const prev = contact.get(p.store_id);
    if (!prev || p.created_at >= prev.at) contact.set(p.store_id, { email: p.requested_by_email, at: p.created_at });
  }
  const q = opts.q.trim().toLowerCase();
  return stores
    .map((s) => ({
      ...s,
      status: subscriberStatus(s, now),
      owner_email: ownerEmail.get(s.owner_id) ?? null,
      payment_contact: contact.get(s.id)?.email ?? null,
    }))
    .filter((s) => !opts.status || s.status === opts.status)
    .filter(
      (s) =>
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.owner_name ?? "").toLowerCase().includes(q) ||
        (s.owner_email ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
}
