import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { isPro, type PlanFields } from "@/lib/plan";
import type { ReceiptPrintDoc } from "@/lib/platform/print-service";
import type { CheckoutResult } from "@/lib/repo";

type ReceiptStore =
  | ({
      name?: string | null;
      currency?: string | null;
      receipt_footer?: string | null;
    } & PlanFields)
  | null;

/**
 * Structured receipt used for printing: same business rules as the text
 * receipt, but it can carry the shop's logo and a large total.
 */
export function buildReceiptPrintDoc(
  result: CheckoutResult,
  store: ReceiptStore,
  logoUrl?: string | null,
): ReceiptPrintDoc {
  const currency = store?.currency ?? "PHP";
  const pro = isPro(store);

  const totals: ReceiptPrintDoc["totals"] = [
    { left: "Subtotal", right: formatMoney(result.sale.subtotal, currency) },
  ];
  if (result.sale.discount > 0) {
    totals.push({ left: "Discount", right: `-${formatMoney(result.sale.discount, currency)}` });
  }
  totals.push({ left: "TOTAL", right: formatMoney(result.sale.total, currency), strong: true });
  if (result.sale.payment_method === "utang") {
    totals.push({ left: "UNPAID", right: "charged to utang" });
  } else if (result.sale.payment_method === "cash") {
    totals.push({ left: "Cash", right: formatMoney(result.sale.cash_received, currency) });
    totals.push({ left: "Change", right: formatMoney(result.sale.change_amount, currency) });
  } else {
    totals.push({ left: "Paid", right: result.sale.payment_method.toUpperCase() });
  }

  const footerParts = [pro ? (store?.receipt_footer ?? "") : "", pro ? "" : "Powered by BentaKo"]
    .filter(Boolean)
    .join("\n");

  return {
    logoUrl: pro ? (logoUrl ?? null) : null,
    storeName: store?.name ?? "BentaKo",
    meta: [result.sale.transaction_number, formatDateTime(result.sale.created_at)],
    items: result.items.map((item) => ({
      left: `${formatQty(item.quantity)}x ${item.product_name_snapshot}`,
      right: formatMoney(item.subtotal, currency),
    })),
    totals,
    footer: footerParts || null,
  };
}

/**
 * Receipt formatting lives here (not in the POS screen) so print and share
 * services — including future thermal printers — reuse the same output.
 */
export function buildReceiptText(
  result: CheckoutResult,
  store:
    | ({ name?: string | null; currency?: string | null; receipt_footer?: string | null } & PlanFields)
    | null,
): string {
  const currency = store?.currency ?? "PHP";

  const lines: string[] = [];

  lines.push(store?.name ?? "BentaKo");
  lines.push(result.sale.transaction_number);
  lines.push(formatDateTime(result.sale.created_at));
  lines.push("--------------------------------");

  for (const item of result.items) {
    lines.push(`${formatQty(item.quantity)} x ${item.product_name_snapshot}`);
    lines.push(`   ${formatMoney(item.subtotal, currency)}`);
  }

  lines.push("--------------------------------");
  lines.push(`TOTAL   ${formatMoney(result.sale.total, currency)}`);
  if (result.sale.payment_method === "utang") {
    lines.push("UNPAID  — charged to utang");
  } else if (result.sale.payment_method === "cash") {
    lines.push(`CASH    ${formatMoney(result.sale.cash_received, currency)}`);
    lines.push(`CHANGE  ${formatMoney(result.sale.change_amount, currency)}`);
  } else {
    lines.push(`PAID    ${result.sale.payment_method.toUpperCase()}`);
  }

  if (store?.receipt_footer) {
    lines.push("");
    lines.push(store.receipt_footer);
  }

  // Free plan keeps a small credit line; Pro receipts are fully the store's own.
  if (!isPro(store)) {
    lines.push("");
    lines.push("Powered by BentaKo");
  }

  return lines.join("\n");
}

