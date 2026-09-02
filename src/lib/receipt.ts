import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import type { CheckoutResult } from "@/lib/repo";

/**
 * Receipt formatting lives here (not in the POS screen) so print and share
 * services — including future thermal printers — reuse the same output.
 */
export function buildReceiptText(
  result: CheckoutResult,
  store: { name?: string | null; currency?: string | null; receipt_footer?: string | null } | null,
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
  lines.push(`CASH    ${formatMoney(result.sale.cash_received, currency)}`);
  lines.push(`CHANGE  ${formatMoney(result.sale.change_amount, currency)}`);

  if (store?.receipt_footer) {
    lines.push("");
    lines.push(store.receipt_footer);
  }

  return lines.join("\n");
}
