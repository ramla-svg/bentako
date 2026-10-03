import { db, type LocalCustomer, type LocalProduct } from "@/lib/local-db";
import type { StoreContext } from "@/lib/repo";

export const STORE = "store-test-a";
export const OTHER = "store-test-b";
export const ctx: StoreContext = { storeId: STORE, userId: "user-test", userName: "Tester" };

export async function resetDb() {
  const d = db();
  await Promise.all(d.tables.map((t) => t.clear()));
}

export async function addProduct(p: Partial<LocalProduct> = {}): Promise<LocalProduct> {
  const now = new Date().toISOString();
  const row: LocalProduct = {
    id: p.id ?? crypto.randomUUID(),
    store_id: STORE,
    category_id: null,
    name: "Test Soda",
    description: null,
    sku: null,
    barcode: null,
    cost_price: 10,
    selling_price: 15,
    stock_quantity: 10,
    low_stock_threshold: 5,
    unit_type: "piece",
    image_url: null,
    is_active: true,
    created_at: now,
    updated_at: now,
    sync_status: "synced",
    ...p,
  };
  await db().products.put(row);
  return row;
}

export async function addCustomer(c: Partial<LocalCustomer> = {}): Promise<LocalCustomer> {
  const now = new Date().toISOString();
  const row: LocalCustomer = {
    id: c.id ?? crypto.randomUUID(),
    store_id: STORE,
    name: "Aling Test",
    mobile_number: null,
    notes: null,
    credit_balance: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
    sync_status: "synced",
    ...c,
  };
  await db().customers.put(row);
  return row;
}

export const line = (p: LocalProduct, quantity = 2) => ({
  product_id: p.id,
  name: p.name,
  category_name: null,
  quantity,
  selling_price: p.selling_price,
  cost_price: p.cost_price,
});
