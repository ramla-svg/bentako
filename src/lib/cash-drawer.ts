import type {
  LocalCashTransaction,
  LocalCustomerPayment,
  LocalDrawerMovement,
  LocalExpense,
  LocalSale,
} from "./local-db";

/**
 * Expected physical drawer cash. Pure: callers pass store-scoped rows and get
 * a deterministic, cents-exact timeline. Nothing before the first counted
 * baseline is ever added on top of counted cash.
 */

export const toCents = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) : 0;
export const fromCents = (cents: number): number => cents / 100;

export type DrawerSource =
  | "count"
  | "cash_sale"
  | "repayment"
  | "cash_add"
  | "cash_withdraw"
  | "expense"
  | "expense_correction"
  | "service";

export interface DrawerEvent {
  id: string;
  at: string;
  source: DrawerSource;
  label: string;
  /** Signed effect in cents; for `count` the counted amount. */
  cents: number;
  beforeCents: number;
  afterCents: number;
  /** For counts: counted minus expected (shortage < 0). */
  differenceCents?: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
}

export interface DrawerInput {
  storeId: string;
  movements: LocalDrawerMovement[];
  sales: LocalSale[];
  payments: LocalCustomerPayment[];
  cashTransactions: LocalCashTransaction[];
  expenses: LocalExpense[];
}

export interface DrawerSummary {
  hasBaseline: boolean;
  baselineAt: string | null;
  lastCount: { at: string; cents: number } | null;
  expectedCents: number;
  /** Oldest first. */
  events: DrawerEvent[];
  inCents: number;
  outCents: number;
  /** Rows after the baseline whose cash effect is unknown and so excluded. */
  excluded: { unclassifiedExpenses: number; unknownRepayments: number; legacyService: number };
  /** Active expenses without a funding source (any date) — need classifying. */
  unclassifiedExpenseIds: string[];
}

type Raw = Omit<DrawerEvent, "beforeCents" | "afterCents" | "differenceCents">;

const MOVEMENT_LABELS: Record<string, string> = {
  count: "Counted cash",
  cash_add: "Cash added",
  cash_withdraw: "Cash taken out",
  expense: "Expense paid from drawer",
  expense_correction: "Expense correction",
};

function order(a: { at: string; id: string }, b: { at: string; id: string }): number {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Net physical cash from one sale: tendered minus change (= total for cash). */
export function saleCashCents(s: LocalSale): number {
  if (s.status !== "completed" || s.payment_method !== "cash") return 0;
  return Math.max(0, toCents(s.cash_received) - toCents(s.change_amount));
}

export function computeDrawer(input: DrawerInput): DrawerSummary {
  const mine = <T extends { store_id: string }>(rows: T[]) =>
    rows.filter((r) => r.store_id === input.storeId);

  const raw: Raw[] = [];
  for (const m of mine(input.movements)) {
    raw.push({
      id: m.id,
      at: m.created_at,
      source: m.kind,
      label: MOVEMENT_LABELS[m.kind] ?? m.kind,
      cents: toCents(m.amount),
      referenceType: m.reference_type,
      referenceId: m.reference_id,
      notes: m.notes,
    });
  }
  const counts = raw.filter((r) => r.source === "count").sort(order);
  const first = counts[0] ?? null;
  const unclassifiedExpenseIds = mine(input.expenses)
    .filter((e) => e.is_active && !e.paid_from)
    .map((e) => e.id);
  const excluded = { unclassifiedExpenses: 0, unknownRepayments: 0, legacyService: 0 };

  if (!first) {
    return {
      hasBaseline: false,
      baselineAt: null,
      lastCount: null,
      expectedCents: 0,
      events: [],
      inCents: 0,
      outCents: 0,
      excluded,
      unclassifiedExpenseIds,
    };
  }
  const after = (at: string) => at > first.at;

  for (const s of mine(input.sales)) {
    const cents = saleCashCents(s);
    if (!cents || !after(s.created_at)) continue;
    raw.push({
      id: s.id,
      at: s.created_at,
      source: "cash_sale",
      label: `Cash sale ${s.transaction_number}`,
      cents,
      referenceType: "sale",
      referenceId: s.id,
      notes: null,
    });
  }
  for (const p of mine(input.payments)) {
    if (p.amount <= 0 || !after(p.created_at)) continue;
    if (!p.payment_method) {
      excluded.unknownRepayments += 1;
      continue;
    }
    if (p.payment_method !== "cash") continue;
    raw.push({
      id: p.id,
      at: p.created_at,
      source: "repayment",
      label: "Utang payment (cash)",
      cents: toCents(p.amount),
      referenceType: "customer",
      referenceId: p.customer_id,
      notes: p.notes,
    });
  }
  for (const t of mine(input.cashTransactions)) {
    if (t.status === "voided" || !after(t.created_at)) continue;
    if (t.drawer_effect == null) {
      excluded.legacyService += 1;
      continue;
    }
    const cents = toCents(t.drawer_effect);
    if (!cents) continue;
    raw.push({
      id: t.id,
      at: t.created_at,
      source: "service",
      label: `GCash/e-wallet ${t.transaction_type === "cash_out" ? "cash out" : "entry"}`,
      cents,
      referenceType: "cash_transaction",
      referenceId: t.id,
      notes: t.notes,
    });
  }
  for (const e of mine(input.expenses)) {
    if (e.is_active && !e.paid_from && after(e.created_at)) excluded.unclassifiedExpenses += 1;
  }

  const timeline = raw.filter((r) => r.source === "count" || after(r.at)).sort(order);
  let balance = 0;
  let inCents = 0;
  let outCents = 0;
  let lastCount: DrawerSummary["lastCount"] = null;
  const events: DrawerEvent[] = [];
  for (const r of timeline) {
    if (r.at < first.at) continue;
    const before = balance;
    if (r.source === "count") {
      balance = r.cents;
      lastCount = { at: r.at, cents: r.cents };
      events.push({
        ...r,
        beforeCents: before,
        afterCents: balance,
        differenceCents: r.id === first.id ? undefined : r.cents - before,
      });
      continue;
    }
    balance += r.cents;
    if (r.cents > 0) inCents += r.cents;
    else outCents -= r.cents;
    events.push({ ...r, beforeCents: before, afterCents: balance });
  }

  return {
    hasBaseline: true,
    baselineAt: first.at,
    lastCount,
    expectedCents: balance,
    events,
    inCents,
    outCents,
    excluded,
    unclassifiedExpenseIds,
  };
}

/**
 * Cash effect an expense should currently have on the drawer (cents, ≤ 0).
 * Only active expenses explicitly paid from the drawer deduct cash.
 */
export function expenseDrawerTarget(e: Pick<LocalExpense, "is_active" | "paid_from" | "amount">) {
  return e.is_active && e.paid_from === "cash" ? -toCents(e.amount) : 0;
}
