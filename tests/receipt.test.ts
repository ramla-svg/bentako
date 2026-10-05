import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildReceiptPrintDoc, buildReceiptText } from "@/lib/receipt";
import { buildReceiptHtml, receiptDocument } from "@/lib/platform/print-service";
import type { CheckoutResult } from "@/lib/repo";

function receipt(method: "cash" | "utang" | "gcash", itemCount = 2): CheckoutResult {
  return {
    sale: {
      id: "sale-test",
      store_id: "store-test",
      transaction_number: "BK-20261005-0001",
      cashier_id: "user-test",
      cashier_name: "Almar",
      subtotal: 123456.75,
      discount: 6.75,
      total: 123450,
      payment_method: method,
      cash_received: method === "cash" ? 130000 : 0,
      change_amount: method === "cash" ? 6550 : 0,
      status: "completed",
      customer_id: method === "utang" ? "customer-test" : null,
      notes: null,
      created_at: "2026-10-05T15:10:00.000Z",
      updated_at: "2026-10-05T15:10:00.000Z",
      sync_status: "pending",
    },
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index}`,
      sale_id: "sale-test",
      store_id: "store-test",
      product_id: `product-${index}`,
      product_name_snapshot:
        index === 0 ? "Very long product <name> & family-size refill pack" : `Item ${index + 1}`,
      category_name_snapshot: null,
      quantity: index === 0 ? 12 : 1,
      cost_price_snapshot: 1,
      selling_price_snapshot: index === 0 ? 10288.0625 : 1,
      subtotal: index === 0 ? 123456.75 : 1,
      created_at: "2026-10-05T15:10:00.000Z",
      sync_status: "pending",
    })),
  };
}

const freeStore = {
  name: "Almar & Family Store",
  currency: "PHP",
  receipt_footer: "Custom footer",
  plan: "free",
  plan_period: null,
  plan_expires_at: null,
  plan_source: null,
} as const;

describe("structured grocery receipt", () => {
  it.each([
    ["cash", "Cash", "Change"],
    ["utang", "UNPAID", "charged to utang"],
    ["gcash", "Paid", "GCASH"],
  ] as const)("maps %s payment labels", (method, label, value) => {
    const doc = buildReceiptPrintDoc(receipt(method), freeStore);
    expect(doc.info).toEqual(expect.arrayContaining([expect.stringContaining("Receipt"), expect.stringContaining("Cashier") ]));
    expect(doc.totals).toEqual(expect.arrayContaining([expect.objectContaining({ left: label, right: expect.stringContaining(value) })]));
  });

  it("builds semantic wrapping columns, prominent total, and escaped content", () => {
    const html = buildReceiptHtml(buildReceiptPrintDoc(receipt("cash"), freeStore));
    expect(html).toContain('<table class="items">');
    expect(html).toContain('class="qty"');
    expect(html).toContain('class="nm"');
    expect(html).toContain('class="amt"');
    expect(html).toContain('class="total"');
    expect(html).toContain("Very long product &lt;name&gt; &amp; family-size refill pack");
    expect(html).not.toContain("Very long product <name>");
    const page = receiptDocument(html, '<Receipt & "test">');
    expect(page).toContain("@page{size:58mm 105mm");
    expect(page).toContain("overflow-wrap:anywhere");
    expect(page).toContain("table-layout:fixed");
    expect(page).toContain("&lt;Receipt &amp; &quot;test&quot;&gt;");
  });

  it("keeps many items without truncating names in markup", () => {
    const result = receipt("cash", 40);
    const html = buildReceiptHtml(buildReceiptPrintDoc(result, freeStore));
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(40);
    expect(html).not.toContain("text-overflow:ellipsis");
    expect(html).toContain("Item 40");
  });

  it("keeps plain-text sharing separate from structured printing", () => {
    const text = buildReceiptText(receipt("cash"), freeStore);
    expect(text).toContain("TOTAL");
    expect(text).not.toContain("<table");
    expect(buildReceiptHtml(buildReceiptPrintDoc(receipt("cash"), freeStore))).toContain("<table");
  });

  it("wires both visible receipt screens to structured printing", () => {
    for (const path of [
      "src/routes/_authenticated/pos.tsx",
      "src/routes/_authenticated/sales.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("buildReceiptPrintDoc(");
      expect(source).toContain("printReceipt(");
      expect(source).not.toContain("printReceiptText(");
    }
  });
});