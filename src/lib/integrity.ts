import { db } from "./local-db";

export interface IntegrityIssue {
  kind: "sale_without_items" | "total_mismatch" | "missing_movement" | "negative_stock";
  label: string;
  reference: string;
}

/**
 * Lightweight local data check for owner diagnostics. Read-only: it reports,
 * it never "repairs" data behind the cashier's back.
 */
export async function runIntegrityCheck(
  storeId: string,
  opts: { allowNegativeStock: boolean },
): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];
  const local = db();

  const sales = await local.sales.where("store_id").equals(storeId).toArray();
  const items = await local.sale_items.where("store_id").equals(storeId).toArray();
  const movements = await local.inventory_movements.where("store_id").equals(storeId).toArray();
  const products = await local.products.where("store_id").equals(storeId).toArray();

  const itemsBySale = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsBySale.get(item.sale_id) ?? [];
    list.push(item);
    itemsBySale.set(item.sale_id, list);
  }
  const movementRefs = new Set(movements.map((m) => m.reference_id));

  for (const sale of sales) {
    if (sale.status === "voided") continue;
    const saleItems = itemsBySale.get(sale.id) ?? [];
    if (saleItems.length === 0) {
      issues.push({
        kind: "sale_without_items",
        label: "A sale has no items recorded",
        reference: sale.transaction_number,
      });
      continue;
    }
    const sum = saleItems.reduce((t, i) => t + i.subtotal, 0);
    if (Math.abs(sum - sale.discount - sale.total) > 0.01) {
      issues.push({
        kind: "total_mismatch",
        label: "Sale total does not match its items",
        reference: sale.transaction_number,
      });
    }
    if (!movementRefs.has(sale.id)) {
      issues.push({
        kind: "missing_movement",
        label: "Sale has no stock movement recorded",
        reference: sale.transaction_number,
      });
    }
  }

  if (!opts.allowNegativeStock) {
    for (const product of products) {
      if (product.is_active && product.stock_quantity < 0) {
        issues.push({
          kind: "negative_stock",
          label: "Stock is below zero",
          reference: product.name,
        });
      }
    }
  }

  return issues;
}
