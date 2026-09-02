import {
  DEFAULT_CATEGORIES,
  db,
  type LocalExpense,
  type LocalMovement,
  type LocalProduct,
  type LocalSale,
  type LocalSaleItem,
  type MovementType,
  type UnitType,
} from "./local-db";
import { localDayKey } from "./format";
import { makeTransactionNumber, nowIso, uuid } from "./ids";
import { enqueue } from "./sync-service";

export interface StoreContext {
  storeId: string;
  userId: string | null;
  userName: string | null;
}

/* ------------------------------------------------------------------ audit */

export async function logAudit(
  ctx: StoreContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const row = {
    id: uuid(),
    store_id: ctx.storeId,
    user_id: ctx.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    created_at: nowIso(),
    sync_status: "pending" as const,
  };
  await db().audit_logs.put(row);
  await enqueue("audit_logs", row.id);
}

/* ------------------------------------------------------------- categories */

export async function ensureDefaultCategories(storeId: string): Promise<void> {
  const count = await db().categories.where("store_id").equals(storeId).count();
  if (count > 0) return;
  let order = 0;
  for (const name of DEFAULT_CATEGORIES) {
    const row = {
      id: uuid(),
      store_id: storeId,
      name,
      sort_order: order++,
      is_active: true,
      created_at: nowIso(),
      updated_at: nowIso(),
      sync_status: "pending" as const,
    };
    await db().categories.put(row);
    await enqueue("categories", row.id);
  }
}

export async function saveCategory(storeId: string, name: string): Promise<string> {
  const row = {
    id: uuid(),
    store_id: storeId,
    name,
    sort_order: 99,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
    sync_status: "pending" as const,
  };
  await db().categories.put(row);
  await enqueue("categories", row.id);
  return row.id;
}

/* --------------------------------------------------------------- products */

export interface ProductInput {
  id?: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_type: UnitType;
  image_url?: string | null;
}

export async function saveProduct(ctx: StoreContext, input: ProductInput): Promise<LocalProduct> {
  const existing = input.id ? await db().products.get(input.id) : undefined;
  const product: LocalProduct = {
    id: existing?.id ?? input.id ?? uuid(),
    store_id: ctx.storeId,
    category_id: input.category_id ?? null,
    name: input.name.trim(),
    description: input.description ?? null,
    sku: input.sku?.trim() || null,
    barcode: input.barcode?.trim() || null,
    cost_price: input.cost_price,
    selling_price: input.selling_price,
    stock_quantity: input.stock_quantity,
    low_stock_threshold: input.low_stock_threshold,
    unit_type: input.unit_type,
    image_url: input.image_url ?? null,
    is_active: existing?.is_active ?? true,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    sync_status: "pending",
  };
  await db().products.put(product);
  await enqueue("products", product.id);

  if (!existing && product.stock_quantity > 0) {
    await recordMovement(ctx, {
      product_id: product.id,
      movement_type: "stock_in",
      quantity: product.stock_quantity,
      previous_stock: 0,
      new_stock: product.stock_quantity,
      unit_cost: product.cost_price,
      notes: "Initial stock",
    });
  } else if (existing && existing.stock_quantity !== product.stock_quantity) {
    const diff = product.stock_quantity - existing.stock_quantity;
    await recordMovement(ctx, {
      product_id: product.id,
      movement_type: diff > 0 ? "adjustment_add" : "adjustment_remove",
      quantity: Math.abs(diff),
      previous_stock: existing.stock_quantity,
      new_stock: product.stock_quantity,
      notes: "Edited from product form",
    });
  }

  await logAudit(ctx, existing ? "product.updated" : "product.created", "product", product.id, {
    name: product.name,
  });
  return product;
}

export async function archiveProduct(ctx: StoreContext, id: string): Promise<void> {
  await db().products.update(id, { is_active: false, updated_at: nowIso(), sync_status: "pending" });
  await enqueue("products", id);
  await logAudit(ctx, "product.archived", "product", id);
}

export async function restoreProduct(ctx: StoreContext, id: string): Promise<void> {
  await db().products.update(id, { is_active: true, updated_at: nowIso(), sync_status: "pending" });
  await enqueue("products", id);
  await logAudit(ctx, "product.restored", "product", id);
}

export async function duplicateProduct(ctx: StoreContext, id: string): Promise<LocalProduct | null> {
  const source = await db().products.get(id);
  if (!source) return null;
  return saveProduct(ctx, {
    name: `${source.name} (copy)`,
    description: source.description,
    category_id: source.category_id,
    sku: null,
    barcode: null,
    cost_price: source.cost_price,
    selling_price: source.selling_price,
    stock_quantity: 0,
    low_stock_threshold: source.low_stock_threshold,
    unit_type: source.unit_type,
    image_url: source.image_url,
  });
}

/* ------------------------------------------------------------- inventory */

async function recordMovement(
  ctx: StoreContext,
  input: {
    product_id: string;
    movement_type: MovementType;
    quantity: number;
    previous_stock: number;
    new_stock: number;
    unit_cost?: number | null;
    supplier?: string | null;
    reference_id?: string | null;
    notes?: string | null;
  },
): Promise<LocalMovement> {
  const row: LocalMovement = {
    id: uuid(),
    store_id: ctx.storeId,
    product_id: input.product_id,
    movement_type: input.movement_type,
    quantity: input.quantity,
    previous_stock: input.previous_stock,
    new_stock: input.new_stock,
    unit_cost: input.unit_cost ?? null,
    supplier: input.supplier ?? null,
    reference_id: input.reference_id ?? null,
    notes: input.notes ?? null,
    created_by: ctx.userId,
    created_at: nowIso(),
    sync_status: "pending",
  };
  await db().inventory_movements.put(row);
  await enqueue("inventory_movements", row.id);
  return row;
}

export async function stockIn(
  ctx: StoreContext,
  input: {
    product_id: string;
    quantity: number;
    unit_cost?: number | null;
    supplier?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  const product = await db().products.get(input.product_id);
  if (!product) throw new Error("Product not found on this device");
  const newStock = product.stock_quantity + input.quantity;
  await db().products.update(product.id, {
    stock_quantity: newStock,
    ...(input.unit_cost ? { cost_price: input.unit_cost } : {}),
    updated_at: nowIso(),
    sync_status: "pending",
  });
  await enqueue("products", product.id);
  await recordMovement(ctx, {
    product_id: product.id,
    movement_type: "stock_in",
    quantity: input.quantity,
    previous_stock: product.stock_quantity,
    new_stock: newStock,
    unit_cost: input.unit_cost ?? null,
    supplier: input.supplier ?? null,
    notes: input.notes ?? null,
  });
  await logAudit(ctx, "stock.in", "product", product.id, { quantity: input.quantity });
}

export async function adjustStock(
  ctx: StoreContext,
  input: {
    product_id: string;
    movement_type: MovementType;
    quantity: number;
    direction: "add" | "remove";
    notes?: string | null;
  },
): Promise<void> {
  const product = await db().products.get(input.product_id);
  if (!product) throw new Error("Product not found on this device");
  const delta = input.direction === "add" ? input.quantity : -input.quantity;
  const newStock = product.stock_quantity + delta;
  await db().products.update(product.id, {
    stock_quantity: newStock,
    updated_at: nowIso(),
    sync_status: "pending",
  });
  await enqueue("products", product.id);
  await recordMovement(ctx, {
    product_id: product.id,
    movement_type: input.movement_type,
    quantity: input.quantity,
    previous_stock: product.stock_quantity,
    new_stock: newStock,
    notes: input.notes ?? null,
  });
  await logAudit(ctx, "stock.adjusted", "product", product.id, {
    movement_type: input.movement_type,
    quantity: input.quantity,
  });
}

/* ----------------------------------------------------------------- sales */

export interface CartLine {
  product_id: string;
  name: string;
  category_name: string | null;
  quantity: number;
  selling_price: number;
  cost_price: number;
}

export interface CheckoutResult {
  sale: LocalSale;
  items: LocalSaleItem[];
}

async function nextTransactionNumber(storeId: string): Promise<string> {
  const today = localDayKey();
  const sales = await db().sales.where("store_id").equals(storeId).toArray();
  const todayCount = sales.filter((s) => localDayKey(s.created_at) === today).length;
  return makeTransactionNumber(todayCount + 1);
}

export async function checkout(
  ctx: StoreContext,
  input: { lines: CartLine[]; cash_received: number; discount?: number; notes?: string | null },
): Promise<CheckoutResult> {
  if (input.lines.length === 0) throw new Error("Cart is empty");

  const subtotal = input.lines.reduce((sum, l) => sum + l.quantity * l.selling_price, 0);
  const discount = input.discount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const createdAt = nowIso();

  const sale: LocalSale = {
    id: uuid(),
    store_id: ctx.storeId,
    transaction_number: await nextTransactionNumber(ctx.storeId),
    cashier_id: ctx.userId,
    cashier_name: ctx.userName,
    subtotal,
    discount,
    total,
    payment_method: "cash",
    cash_received: input.cash_received,
    change_amount: Math.max(0, input.cash_received - total),
    status: "completed",
    customer_id: null,
    notes: input.notes ?? null,
    created_at: createdAt,
    updated_at: createdAt,
    sync_status: "pending",
  };

  const items: LocalSaleItem[] = input.lines.map((line) => ({
    id: uuid(),
    sale_id: sale.id,
    store_id: ctx.storeId,
    product_id: line.product_id,
    product_name_snapshot: line.name,
    category_name_snapshot: line.category_name,
    quantity: line.quantity,
    cost_price_snapshot: line.cost_price,
    selling_price_snapshot: line.selling_price,
    subtotal: line.quantity * line.selling_price,
    created_at: createdAt,
    sync_status: "pending",
  }));

  await db().sales.put(sale);
  await db().sale_items.bulkPut(items);

  // Deduct stock locally + write a movement per line.
  for (const line of input.lines) {
    const product = await db().products.get(line.product_id);
    if (!product) continue;
    const newStock = product.stock_quantity - line.quantity;
    await db().products.update(product.id, {
      stock_quantity: newStock,
      updated_at: nowIso(),
      sync_status: "pending",
    });
    await enqueue("products", product.id);
    await recordMovement(ctx, {
      product_id: product.id,
      movement_type: "sale",
      quantity: line.quantity,
      previous_stock: product.stock_quantity,
      new_stock: newStock,
      reference_id: sale.id,
      notes: sale.transaction_number,
    });
  }

  await enqueue("sales", sale.id);
  for (const item of items) await enqueue("sale_items", item.id);

  return { sale, items };
}

export async function voidSale(ctx: StoreContext, saleId: string): Promise<void> {
  const sale = await db().sales.get(saleId);
  if (!sale || sale.status === "voided") return;
  await db().sales.update(saleId, {
    status: "voided",
    updated_at: nowIso(),
    sync_status: "pending",
  });
  await enqueue("sales", saleId);

  const items = await db().sale_items.where("sale_id").equals(saleId).toArray();
  for (const item of items) {
    if (!item.product_id) continue;
    const product = await db().products.get(item.product_id);
    if (!product) continue;
    const newStock = product.stock_quantity + item.quantity;
    await db().products.update(product.id, {
      stock_quantity: newStock,
      updated_at: nowIso(),
      sync_status: "pending",
    });
    await enqueue("products", product.id);
    await recordMovement(ctx, {
      product_id: product.id,
      movement_type: "void_restore",
      quantity: item.quantity,
      previous_stock: product.stock_quantity,
      new_stock: newStock,
      reference_id: saleId,
      notes: `Voided ${sale.transaction_number}`,
    });
  }
  await logAudit(ctx, "sale.voided", "sale", saleId, {
    transaction_number: sale.transaction_number,
    total: sale.total,
  });
}

/* -------------------------------------------------------------- expenses */

export interface ExpenseInput {
  id?: string;
  title: string;
  category: string;
  amount: number;
  notes?: string | null;
  expense_date: string;
}

export async function saveExpense(ctx: StoreContext, input: ExpenseInput): Promise<LocalExpense> {
  const existing = input.id ? await db().expenses.get(input.id) : undefined;
  const row: LocalExpense = {
    id: existing?.id ?? uuid(),
    store_id: ctx.storeId,
    title: input.title.trim(),
    category: input.category,
    amount: input.amount,
    notes: input.notes ?? null,
    expense_date: input.expense_date,
    is_active: existing?.is_active ?? true,
    created_by: existing?.created_by ?? ctx.userId,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    sync_status: "pending",
  };
  await db().expenses.put(row);
  await enqueue("expenses", row.id);
  await logAudit(ctx, existing ? "expense.updated" : "expense.created", "expense", row.id, {
    title: row.title,
    amount: row.amount,
  });
  return row;
}

export async function archiveExpense(ctx: StoreContext, id: string): Promise<void> {
  await db().expenses.update(id, { is_active: false, updated_at: nowIso(), sync_status: "pending" });
  await enqueue("expenses", id);
  await logAudit(ctx, "expense.archived", "expense", id);
}

/* ------------------------------------------------------------ demo data */

export const DEMO_PRODUCTS: {
  name: string;
  category: string;
  cost: number;
  price: number;
  stock: number;
  unit: UnitType;
}[] = [
  { name: "Coke Mismo", category: "Drinks", cost: 16, price: 20, stock: 24, unit: "bottle" },
  { name: "Mineral Water 500ml", category: "Drinks", cost: 11, price: 15, stock: 24, unit: "bottle" },
  { name: "Lucky Me Pancit Canton", category: "Noodles", cost: 12, price: 15, stock: 30, unit: "pack" },
  { name: "Nescafé 3-in-1", category: "Coffee", cost: 6, price: 8, stock: 40, unit: "sachet" },
  { name: "SkyFlakes", category: "Snacks", cost: 7, price: 9, stock: 25, unit: "pack" },
  { name: "Sardines 155g", category: "Canned Goods", cost: 20, price: 25, stock: 18, unit: "can" },
  { name: "Shampoo Sachet", category: "Toiletries", cost: 5, price: 7, stock: 35, unit: "sachet" },
  { name: "Egg", category: "Other", cost: 8, price: 10, stock: 30, unit: "piece" },
];

export async function seedDemoProducts(ctx: StoreContext): Promise<number> {
  await ensureDefaultCategories(ctx.storeId);
  const categories = await db().categories.where("store_id").equals(ctx.storeId).toArray();
  let created = 0;
  for (const demo of DEMO_PRODUCTS) {
    const category = categories.find((c) => c.name === demo.category);
    await saveProduct(ctx, {
      name: demo.name,
      category_id: category?.id ?? null,
      cost_price: demo.cost,
      selling_price: demo.price,
      stock_quantity: demo.stock,
      low_stock_threshold: 5,
      unit_type: demo.unit,
    });
    created += 1;
  }
  return created;
}
