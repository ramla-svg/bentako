import { fromCents, toCents } from "./cash-drawer";
import type { CashTxnType, LocalCashTransaction } from "./local-db";

export const CASH_SERVICE_KINDS = [
  "cash_in",
  "cash_out",
  "add_balance",
  "buy_load",
  "pay_bills",
] as const;
export type CashServiceKind = (typeof CASH_SERVICE_KINDS)[number];
export type PhysicalCashMove = "in" | "out" | "none";

export function isCashServiceKind(value: unknown): value is CashServiceKind {
  return CASH_SERVICE_KINDS.some((kind) => kind === value);
}

/** Stored transaction_type is wallet direction, NOT the customer's service name. */
export function walletDirection(kind: CashServiceKind): CashTxnType {
  return kind === "cash_out" || kind === "add_balance" ? "cash_in" : "cash_out";
}

export function suggestedPhysicalCash(kind: CashServiceKind, source = ""): PhysicalCashMove {
  if (kind === "add_balance") return source === "Cash on hand" ? "out" : "none";
  return kind === "cash_out" ? "out" : "in";
}

/** Only the explicitly confirmed physical movement and cash-collected fee count. */
export function physicalCashEffect(move: PhysicalCashMove, amount: number, feeInCash = 0): number {
  const sign = move === "in" ? 1 : move === "out" ? -1 : 0;
  return fromCents(sign * toCents(amount) + toCents(feeInCash));
}

/** Legacy labels retain their old meaning; never use them to reinterpret wallet or cash. */
export function serviceKindOf(row: LocalCashTransaction): CashServiceKind {
  if (isCashServiceKind(row.service_kind)) return row.service_kind;
  if (row.transaction_type === "cash_out") return "cash_out";
  return (row.notes ?? "").startsWith("Add balance") ? "add_balance" : "cash_in";
}

export const CASH_SERVICE_LABELS: Record<CashServiceKind, string> = {
  cash_in: "Cash In",
  cash_out: "Cash Out",
  add_balance: "Add Balance",
  buy_load: "Buy Load",
  pay_bills: "Pay Bills",
};

/** All recorded wallet directions, including untouched legacy entries, in cents. */
export function recordedWalletBalance(rows: LocalCashTransaction[], storeId: string): number {
  return fromCents(
    rows.reduce((sum, row) => {
      if (row.store_id !== storeId || row.provider === "other" || row.status === "voided")
        return sum;
      return sum + (row.transaction_type === "cash_in" ? 1 : -1) * toCents(row.amount);
    }, 0),
  );
}
