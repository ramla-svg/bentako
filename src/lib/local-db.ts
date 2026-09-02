import Dexie, { type Table } from "dexie";

export type SyncStatus = "pending" | "synced" | "failed";

export type UnitType =
  | "piece"
  | "pack"
  | "sachet"
  | "bottle"
  | "can"
  | "box"
  | "kilo"
  | "gram"
  | "liter"
  | "ml"
  | "other";

export const UNIT_TYPES: UnitType[] = [
  "piece",
  "pack",
  "sachet",
  "bottle",
  "can",
  "box",
  "kilo",
  "gram",
  "liter",
  "ml",
  "other",
];

export type MovementType =
  | "stock_in"
  | "sale"
  | "adjustment_add"
  | "adjustment_remove"
  | "damaged"
  | "expired"
  | "returned"
  | "void_restore";

export interface LocalCategory {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface LocalProduct {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_type: UnitType;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface LocalSale {
  id: string;
  store_id: string;
  transaction_number: string;
  cashier_id: string | null;
  cashier_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: "cash" | "gcash" | "maya" | "bank" | "other";
  cash_received: number;
  change_amount: number;
  status: "completed" | "voided";
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface LocalSaleItem {
  id: string;
  sale_id: string;
  store_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  category_name_snapshot: string | null;
  quantity: number;
  cost_price_snapshot: number;
  selling_price_snapshot: number;
  subtotal: number;
  created_at: string;
  sync_status: SyncStatus;
}

export interface LocalMovement {
  id: string;
  store_id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_cost: number | null;
  supplier: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  sync_status: SyncStatus;
}

export interface LocalExpense {
  id: string;
  store_id: string;
  title: string;
  category: string;
  amount: number;
  notes: string | null;
  expense_date: string; // YYYY-MM-DD
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

export interface LocalAudit {
  id: string;
  store_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  sync_status: SyncStatus;
}

export type SyncEntity =
  | "products"
  | "categories"
  | "sales"
  | "sale_items"
  | "inventory_movements"
  | "expenses"
  | "audit_logs";

export type SyncQueueStatus = "pending" | "syncing" | "synced" | "failed";

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  entity_id: string;
  operation: "upsert";
  /** Snapshot of the row at enqueue time (fallback if the local row is gone). */
  payload: Record<string, unknown>;
  /** Sale header + items + movements share one group so they retry together. */
  group_id: string | null;
  status: SyncQueueStatus;
  retry_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

class BentakoDatabase extends Dexie {
  products!: Table<LocalProduct, string>;
  categories!: Table<LocalCategory, string>;
  sales!: Table<LocalSale, string>;
  sale_items!: Table<LocalSaleItem, string>;
  inventory_movements!: Table<LocalMovement, string>;
  expenses!: Table<LocalExpense, string>;
  audit_logs!: Table<LocalAudit, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super("saripos");
    this.version(1).stores({
      products: "id, store_id, name, category_id, barcode, sku, is_active, sync_status",
      categories: "id, store_id, name, sync_status",
      sales: "id, store_id, created_at, status, transaction_number, sync_status",
      sale_items: "id, sale_id, store_id, product_id, sync_status",
      inventory_movements: "id, store_id, product_id, created_at, sync_status",
      expenses: "id, store_id, expense_date, is_active, sync_status",
      audit_logs: "id, store_id, created_at, sync_status",
      sync_queue: "id, entity, entity_id, status, created_at",
      settings: "key",
    });
    // v2 adds group/attempt tracking to the queue. Upgrades never drop rows:
    // pending offline sales survive an app update.
    this.version(2)
      .stores({
        sync_queue: "id, entity, entity_id, status, group_id, created_at",
      })
      .upgrade(async (tx) =>
        tx
          .table("sync_queue")
          .toCollection()
          .modify((item: Partial<SyncQueueItem>) => {
            item.group_id = item.group_id ?? null;
            item.last_attempt_at = item.last_attempt_at ?? null;
            if (item.status === "syncing") item.status = "pending";
          }),
      );
  }
}


let instance: BentakoDatabase | null = null;

/**
 * Local database accessor. Kept behind this function so the storage engine can
 * later be swapped for Capacitor SQLite without touching feature code.
 */
export function db(): BentakoDatabase {
  if (typeof window === "undefined") {
    throw new Error("Local database is only available in the browser");
  }
  if (!instance) instance = new BentakoDatabase();
  return instance;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db().settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db().settings.put({ key, value, updated_at: new Date().toISOString() });
}

export const DEFAULT_CATEGORIES = [
  "Drinks",
  "Snacks",
  "Canned Goods",
  "Noodles",
  "Coffee",
  "Toiletries",
  "Household",
  "Cigarettes",
  "Other",
];

export const EXPENSE_CATEGORIES = [
  "Inventory Purchase",
  "Transportation",
  "Electricity",
  "Water",
  "Rent",
  "Food",
  "Maintenance",
  "Supplies",
  "Other",
];

export const ADJUSTMENT_REASONS: { value: MovementType; label: string; direction: "add" | "remove" }[] =
  [
    { value: "adjustment_add", label: "Correction (add)", direction: "add" },
    { value: "returned", label: "Returned", direction: "add" },
    { value: "adjustment_remove", label: "Correction (remove)", direction: "remove" },
    { value: "damaged", label: "Damaged", direction: "remove" },
    { value: "expired", label: "Expired", direction: "remove" },
  ];
