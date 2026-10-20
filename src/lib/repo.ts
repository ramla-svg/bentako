import {
  DEFAULT_CATEGORIES,
  db,
  type CashTxnType,
  type LocalCashPhoto,
  type LocalCashTransaction,
  type LocalCustomer,
  type LocalCustomerPayment,
  type LocalDrawerMovement,
  type LocalExpense,
  type ExpensePaidFrom,
  type RepaymentMethod,
  type LocalMovement,
  type LocalProduct,
  type LocalSale,
  type LocalSaleItem,
  type MovementType,
  type PaymentMethod,
  type ServiceProvider,
  type UnitType,
} from "./local-db";
import { canAddProduct, planLimits, type PlanFields } from "./plan";
import { localDayKey } from "./format";
import {
  computeDrawer,
  expenseDrawerTarget,
  fromCents,
  saleCashCents,
  toCents,
  type DrawerSummary,
} from "./cash-drawer";
import { makeTransactionNumber, nowIso, uuid } from "./ids";
import { beginCriticalWork, endCriticalWork, enqueue } from "./sync-service";

export interface StoreContext {
  storeId: string;
  userId: string | null;
  userName: string | null;
  /** Cached store plan; omitted context safely uses Free limits. */
  plan?: PlanFields | null;
}

/* ------------------------------------------------------------- guards */

/** Finite number check that never accepts NaN/Infinity from form parsing. */
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Runs `fn` as one Dexie read-write transaction while holding critical-work
 * protection, so a sync pass never reads half-written state and every row,
 * audit entry and upload intent commits (or rolls back) together.
 */
async function atomic<T>(tableNames: string[], fn: () => Promise<T>): Promise<T> {
  beginCriticalWork();
  try {
    const local = db();
    const tables = [...new Set([...tableNames, "sync_queue", "audit_logs"])].map((n) =>
      local.table(n),
    );
    return await local.transaction("rw", tables, fn);
  } finally {
    endCriticalWork();
  }
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
  // Activity logs stay on this device: they are never enqueued for upload.
  await db().audit_logs.put(row);
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
  let existing: LocalProduct | undefined;
  const product = await db().transaction("rw", db().products, async () => {
    existing = input.id ? await db().products.get(input.id) : undefined;
    if (existing && existing.store_id !== ctx.storeId)
      throw new Error("Product not found in this store");
    if (!existing) await assertProductCapacity(ctx);
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
    return product;
  });
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

async function assertProductCapacity(ctx: StoreContext): Promise<void> {
  const count = await db()
    .products.where("store_id")
    .equals(ctx.storeId)
    .filter((p) => p.is_active)
    .count();
  if (!canAddProduct(ctx.plan, count))
    throw new Error("Free allows 60 active products. Archive a product first or see Pro.");
}

export async function archiveProduct(ctx: StoreContext, id: string): Promise<void> {
  await atomic(["products"], async () => {
    const product = await db().products.get(id);
    if (!product || product.store_id !== ctx.storeId)
      throw new Error("Product not found in this store");
    await db().products.update(id, {
      is_active: false,
      updated_at: nowIso(),
      sync_status: "pending",
    });
    await enqueue("products", id);
    await logAudit(ctx, "product.archived", "product", id);
  });
}

export async function restoreProduct(ctx: StoreContext, id: string): Promise<void> {
  await atomic(["products"], async () => {
    const product = await db().products.get(id);
    if (!product || product.store_id !== ctx.storeId)
      throw new Error("Product not found in this store");
    if (!product.is_active) await assertProductCapacity(ctx);
    await db().products.update(id, {
      is_active: true,
      updated_at: nowIso(),
      sync_status: "pending",
    });
    await enqueue("products", id);
    await logAudit(ctx, "product.restored", "product", id);
  });
}

export async function duplicateProduct(
  ctx: StoreContext,
  id: string,
): Promise<LocalProduct | null> {
  const source = await db().products.get(id);
  if (!source) return null;
  if (source.store_id !== ctx.storeId) throw new Error("Product not found in this store");
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
  if (!finite(input.quantity) || input.quantity <= 0) throw new Error("Enter a quantity.");
  if (input.unit_cost != null && (!finite(input.unit_cost) || input.unit_cost < 0))
    throw new Error("Enter a valid cost.");
  await atomic(["products", "inventory_movements"], async () => {
    const product = await db().products.get(input.product_id);
    if (!product || product.store_id !== ctx.storeId)
      throw new Error("Product not found on this device");
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
  });
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
  if (!finite(input.quantity) || input.quantity <= 0) throw new Error("Enter a quantity.");
  await atomic(["products", "inventory_movements"], async () => {
    const product = await db().products.get(input.product_id);
    if (!product || product.store_id !== ctx.storeId)
      throw new Error("Product not found on this device");
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
  const todaysNumbers = new Set(
    sales.filter((s) => localDayKey(s.created_at) === today).map((s) => s.transaction_number),
  );
  // Continue from the highest number already used today (count alone breaks once
  // cloud sales from another device are pulled in).
  let sequence = 1;
  for (const number of todaysNumbers) {
    const parsed = Number(number.split("-").at(-1));
    if (Number.isFinite(parsed) && parsed >= sequence) sequence = parsed + 1;
  }
  let candidate = makeTransactionNumber(sequence);
  while (todaysNumbers.has(candidate)) candidate = makeTransactionNumber(++sequence);
  return candidate;
}

function buildMovement(
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
): LocalMovement {
  return {
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
}

export async function checkout(
  ctx: StoreContext,
  input: {
    lines: CartLine[];
    cash_received: number;
    discount?: number;
    notes?: string | null;
    payment_method?: PaymentMethod;
    customer_id?: string | null;
  },
): Promise<CheckoutResult> {
  if (input.lines.length === 0) throw new Error("Cart is empty");

  const method: PaymentMethod = input.payment_method ?? "cash";
  const customerId = method === "utang" ? (input.customer_id ?? null) : null;
  if (method === "utang" && !customerId) throw new Error("Choose a customer for this utang.");

  const seen = new Set<string>();
  for (const l of input.lines) {
    if (seen.has(l.product_id)) throw new Error("The same product appears twice in the cart.");
    seen.add(l.product_id);
    if (!finite(l.quantity) || l.quantity <= 0) throw new Error(`Invalid quantity for ${l.name}.`);
    if (!finite(l.selling_price) || l.selling_price < 0)
      throw new Error(`Invalid price for ${l.name}.`);
    if (!finite(l.cost_price) || l.cost_price < 0) throw new Error(`Invalid cost for ${l.name}.`);
  }
  if (input.discount != null && (!finite(input.discount) || input.discount < 0))
    throw new Error("Invalid discount.");
  if (method === "cash" && (!finite(input.cash_received) || input.cash_received < 0))
    throw new Error("Invalid cash received.");

  const subtotal = input.lines.reduce((sum, l) => sum + l.quantity * l.selling_price, 0);
  const discount = input.discount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const cashReceived = method === "cash" ? input.cash_received : 0;
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
    payment_method: method,
    cash_received: cashReceived,
    change_amount: Math.max(0, cashReceived - total),
    status: "completed",
    customer_id: customerId,
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

  const touchedProducts: string[] = [];
  const movements: LocalMovement[] = [];

  // Single atomic local write: sale, items, stock deduction and movements all
  // land together or not at all — even if the tab closes mid-checkout.
  beginCriticalWork();
  try {
    const local = db();
    await local.transaction(
      "rw",
      [
        local.sales,
        local.sale_items,
        local.products,
        local.inventory_movements,
        local.customers,
        local.sync_queue,
      ],
      async () => {
        await local.sales.put(sale);
        await local.sale_items.bulkPut(items);

        for (const line of input.lines) {
          const product = await local.products.get(line.product_id);
          if (product && product.store_id !== ctx.storeId)
            throw new Error("A product in the cart belongs to another store.");
          if (!product) continue;
          const newStock = product.stock_quantity - line.quantity;
          await local.products.update(product.id, {
            stock_quantity: newStock,
            updated_at: nowIso(),
            sync_status: "pending",
          });
          touchedProducts.push(product.id);
          movements.push(
            buildMovement(ctx, {
              product_id: product.id,
              movement_type: "sale",
              quantity: line.quantity,
              previous_stock: product.stock_quantity,
              new_stock: newStock,
              reference_id: sale.id,
              notes: sale.transaction_number,
            }),
          );
        }
        if (movements.length > 0) await local.inventory_movements.bulkPut(movements);

        // Utang: the customer owes this sale. The balance mirror moves in the
        // same commit as the sale, so the two can never disagree on device.
        if (customerId) {
          const customer = await local.customers.get(customerId);
          if (!customer || customer.store_id !== ctx.storeId)
            throw new Error("Customer not found in this store.");
          {
            await local.customers.update(customerId, {
              credit_balance: customer.credit_balance + total,
              updated_at: nowIso(),
              sync_status: "pending",
            });
          }
        }

        // Queue intent is part of this same local commit. An app close directly
        // after checkout cannot leave a saved sale undiscoverable by sync.
        const group = sale.id;
        for (const productId of touchedProducts)
          await enqueue("products", productId, { groupId: group });
        if (customerId) await enqueue("customers", customerId, { groupId: group });
        await enqueue("sales", sale.id, { groupId: group });
        for (const item of items) await enqueue("sale_items", item.id, { groupId: group });
        for (const movement of movements)
          await enqueue("inventory_movements", movement.id, { groupId: group });
      },
    );
  } finally {
    endCriticalWork();
  }

  return { sale, items };
}

/**
 * Voids a sale once. Status is re-checked inside the transaction, so repeated
 * or concurrent taps restore stock and utang exactly once; every change and its
 * upload intent commit together.
 */
export async function voidSale(
  ctx: StoreContext,
  saleId: string,
  /** Cash sales only: whether the cash was actually handed back now. */
  options: { cashReturned?: boolean } = {},
): Promise<boolean> {
  return atomic(
    ["sales", "sale_items", "products", "customers", "inventory_movements", "cash_drawer_movements"],
    async () => {
      const local = db();
      const sale = await local.sales.get(saleId);
      if (!sale || sale.store_id !== ctx.storeId || sale.status === "voided") return false;
      const now = nowIso();
      const group = `void:${saleId}`;
      // Drawer decision first (reads before any enqueue). One per sale.
      let drawerRow: LocalDrawerMovement | null = null;
      const refundCents = saleCashCents(sale);
      if (refundCents > 0) {
        const prior = await local.cash_drawer_movements
          .where("reference_id")
          .equals(saleId)
          .filter((m) => m.kind === "sale_refund" || m.kind === "sale_void_no_refund")
          .count();
        if (!prior) {
          const returned = options.cashReturned === true;
          drawerRow = {
            id: uuid(),
            store_id: ctx.storeId,
            kind: returned ? "sale_refund" : "sale_void_no_refund",
            amount: returned ? fromCents(-refundCents) : 0,
            reference_type: "sale",
            reference_id: saleId,
            notes: sale.transaction_number,
            created_by: ctx.userId,
            created_at: now,
            updated_at: now,
            sync_status: "pending",
          };
          await local.cash_drawer_movements.put(drawerRow);
        }
      }
      await local.sales.update(saleId, {
        status: "voided",
        updated_at: now,
        sync_status: "pending",
      });
      await enqueue("sales", saleId, { groupId: group });
      if (drawerRow) await enqueue("cash_drawer_movements", drawerRow.id, { groupId: group });

      if (sale.payment_method === "utang" && sale.customer_id) {
        const customer = await local.customers.get(sale.customer_id);
        if (customer && customer.store_id === ctx.storeId) {
          await local.customers.update(customer.id, {
            credit_balance: customer.credit_balance - sale.total,
            updated_at: now,
            sync_status: "pending",
          });
          await enqueue("customers", customer.id, { groupId: group });
        }
      }

      const items = await local.sale_items.where("sale_id").equals(saleId).toArray();
      for (const item of items) {
        if (!item.product_id || item.store_id !== ctx.storeId) continue;
        const product = await local.products.get(item.product_id);
        if (!product || product.store_id !== ctx.storeId) continue;
        const newStock = product.stock_quantity + item.quantity;
        await local.products.update(product.id, {
          stock_quantity: newStock,
          updated_at: now,
          sync_status: "pending",
        });
        await enqueue("products", product.id, { groupId: group });
        const movement = buildMovement(ctx, {
          product_id: product.id,
          movement_type: "void_restore",
          quantity: item.quantity,
          previous_stock: product.stock_quantity,
          new_stock: newStock,
          reference_id: saleId,
          notes: `Voided ${sale.transaction_number}`,
        });
        await local.inventory_movements.put(movement);
        await enqueue("inventory_movements", movement.id, { groupId: group });
      }
      await logAudit(ctx, "sale.voided", "sale", saleId, {
        transaction_number: sale.transaction_number,
        total: sale.total,
        cash_returned: drawerRow ? drawerRow.kind === "sale_refund" : null,
      });
      return true;
    },
  );
}

/* -------------------------------------------------------------- expenses */

export interface ExpenseInput {
  id?: string;
  title: string;
  category: string;
  amount: number;
  notes?: string | null;
  expense_date: string;
  /** Required for new expenses; omitted on edit keeps the saved source. */
  paid_from?: ExpensePaidFrom | null;
}

const PAID_FROM = new Set<ExpensePaidFrom>(["cash", "gcash", "maya", "bank", "other"]);

/**
 * Brings the drawer ledger in line with an expense's current state by writing
 * only the difference, so edits and archives never double-deduct. Expenses
 * dated before the latest physical count are already reflected in that count
 * and are left alone.
 */
async function reconcileExpenseDrawer(ctx: StoreContext, e: LocalExpense): Promise<void> {
  const local = db();
  const all = await local.cash_drawer_movements.where("store_id").equals(ctx.storeId).toArray();
  const linked = all.filter((m) => m.reference_type === "expense" && m.reference_id === e.id);
  const current = linked.reduce((sum, m) => sum + toCents(m.amount), 0);
  const delta = expenseDrawerTarget(e) - current;
  if (delta === 0) return;
  const lastCount = all
    .filter((m) => m.kind === "count")
    .reduce<string | null>((max, m) => (max && max > m.created_at ? max : m.created_at), null);
  if (lastCount && e.created_at <= lastCount) return;
  const now = nowIso();
  const row: LocalDrawerMovement = {
    id: uuid(),
    store_id: ctx.storeId,
    kind: linked.length ? "expense_correction" : "expense",
    amount: fromCents(delta),
    reference_type: "expense",
    reference_id: e.id,
    notes: e.title,
    created_by: ctx.userId,
    created_at: now,
    updated_at: now,
    sync_status: "pending",
  };
  await local.cash_drawer_movements.put(row);
  await enqueue("cash_drawer_movements", row.id, { groupId: `expense:${e.id}` });
}

export async function saveExpense(ctx: StoreContext, input: ExpenseInput): Promise<LocalExpense> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount.");
  if (!input.title.trim()) throw new Error("What is this expense for?");
  if (input.paid_from != null && !PAID_FROM.has(input.paid_from))
    throw new Error("Choose where the money came from.");
  return atomic(["expenses", "cash_drawer_movements"], async () => {
    const existing = input.id ? await db().expenses.get(input.id) : undefined;
    if (existing && existing.store_id !== ctx.storeId)
      throw new Error("Expense not found in this store.");
    const paidFrom =
      input.paid_from === undefined ? (existing?.paid_from ?? null) : input.paid_from;
    if (!existing && !paidFrom) throw new Error("Choose where the money came from.");
    const row: LocalExpense = {
      id: existing?.id ?? input.id ?? uuid(),
      store_id: ctx.storeId,
      title: input.title.trim(),
      category: input.category,
      amount,
      notes: input.notes ?? null,
      expense_date: input.expense_date,
      paid_from: paidFrom,
      is_active: existing?.is_active ?? true,
      created_by: existing?.created_by ?? ctx.userId,
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
      sync_status: "pending",
    };
    await db().expenses.put(row);
    // Drawer reads happen before enqueue: a query after enqueue in the same
    // transaction commits it early under IndexedDB auto-commit rules.
    await reconcileExpenseDrawer(ctx, row);
    await enqueue("expenses", row.id, { groupId: `expense:${row.id}` });
    await logAudit(ctx, existing ? "expense.updated" : "expense.created", "expense", row.id, {
      title: row.title,
      amount: row.amount,
      paid_from: row.paid_from,
    });
    return row;
  });
}

export async function archiveExpense(ctx: StoreContext, id: string): Promise<void> {
  await atomic(["expenses", "cash_drawer_movements"], async () => {
    const existing = await db().expenses.get(id);
    if (!existing || existing.store_id !== ctx.storeId)
      throw new Error("Expense not found in this store.");
    if (!existing.is_active) return;
    const row = {
      ...existing,
      is_active: false,
      updated_at: nowIso(),
      sync_status: "pending" as const,
    };
    await db().expenses.put(row);
    // Drawer reads happen before enqueue: a query after enqueue in the same
    // transaction commits it early under IndexedDB auto-commit rules.
    await reconcileExpenseDrawer(ctx, row);
    await enqueue("expenses", id, { groupId: `expense:${id}` });
    await logAudit(ctx, "expense.archived", "expense", id);
  });
}

/* ---------------------------------------------------------- cash drawer */

async function putDrawerMovement(
  ctx: StoreContext,
  input: {
    id?: string | undefined;
    kind: LocalDrawerMovement["kind"];
    amount: number;
    notes?: string | null | undefined;
  },
): Promise<LocalDrawerMovement> {
  return atomic(["cash_drawer_movements"], async () => {
    const local = db();
    if (input.id) {
      const prior = await local.cash_drawer_movements.get(input.id);
      if (prior) {
        if (prior.store_id !== ctx.storeId) throw new Error("Entry belongs to another store.");
        return prior; // repeated tap / retry: already saved once
      }
    }
    const now = nowIso();
    const row: LocalDrawerMovement = {
      id: input.id ?? uuid(),
      store_id: ctx.storeId,
      kind: input.kind,
      amount: input.amount,
      reference_type: null,
      reference_id: null,
      notes: input.notes?.trim() || null,
      created_by: ctx.userId,
      created_at: now,
      updated_at: now,
      sync_status: "pending",
    };
    await local.cash_drawer_movements.put(row);
    await enqueue("cash_drawer_movements", row.id);
    await logAudit(ctx, `drawer.${input.kind}`, "cash_drawer_movement", row.id, {
      amount: row.amount,
    });
    return row;
  });
}

/** Records the physical cash counted right now; becomes the new baseline. */
export function recordCashCount(
  ctx: StoreContext,
  input: { id?: string; counted: number; notes?: string | null },
): Promise<LocalDrawerMovement> {
  const counted = Number(input.counted);
  if (!Number.isFinite(counted) || counted < 0) throw new Error("Enter the cash you counted.");
  return putDrawerMovement(ctx, {
    id: input.id,
    kind: "count",
    amount: fromCents(toCents(counted)),
    notes: input.notes,
  });
}

/** Owner top-up or withdrawal. Not revenue, not an expense. */
export function recordDrawerMovement(
  ctx: StoreContext,
  input: { id?: string; direction: "add" | "withdraw"; amount: number; notes?: string | null },
): Promise<LocalDrawerMovement> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount.");
  const cents = toCents(amount);
  return putDrawerMovement(ctx, {
    id: input.id,
    kind: input.direction === "add" ? "cash_add" : "cash_withdraw",
    amount: fromCents(input.direction === "add" ? cents : -cents),
    notes: input.notes,
  });
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
  {
    name: "Mineral Water 500ml",
    category: "Drinks",
    cost: 11,
    price: 15,
    stock: 24,
    unit: "bottle",
  },
  {
    name: "Lucky Me Pancit Canton",
    category: "Noodles",
    cost: 12,
    price: 15,
    stock: 30,
    unit: "pack",
  },
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
    const activeCount = await db()
      .products.where("store_id")
      .equals(ctx.storeId)
      .filter((p) => p.is_active)
      .count();
    if (!canAddProduct(ctx.plan, activeCount)) break;
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

/* ------------------------------------------------------- barcode / code lookup */

/**
 * Resolves a scanned or typed code (barcode or SKU) to a product from the local
 * cache. Barcode readiness: a future camera/native scanner only needs to pass
 * its string value here — no POS logic changes required.
 */
export async function findProductByCode(
  storeId: string,
  code: string,
): Promise<LocalProduct | null> {
  const needle = code.trim();
  if (!needle) return null;
  const products = await db().products.where("store_id").equals(storeId).toArray();
  return matchProductByCode(products, needle);
}

/** Pure matcher so screens with products already in memory can reuse it. */
export function matchProductByCode(products: LocalProduct[], code: string): LocalProduct | null {
  const needle = code.trim().toLowerCase();
  if (!needle) return null;
  const active = products.filter((p) => p.is_active);
  return (
    active.find((p) => (p.barcode ?? "").toLowerCase() === needle) ??
    active.find((p) => (p.sku ?? "").toLowerCase() === needle) ??
    null
  );
}

/* ------------------------------------------------------------ cash ledger */

export interface CashTransactionInput {
  transaction_type: CashTxnType;
  provider: ServiceProvider;
  amount: number;
  service_fee?: number;
  customer_name?: string | null;
  customer_mobile_number?: string | null;
  reference_number?: string | null;
  /** Optional note: source of the money or what the entry is for. */
  notes?: string | null;
  /** Optional receipt/screenshot kept on this device only. */
  photo?: Blob | null;
  /** Signed physical drawer cash effect the user confirmed (fee included if collected in cash). */
  drawer_effect?: number | null;
}

/**
 * Records a drawer or e-wallet movement. The row, its audit entry and the
 * upload intent all land in one local commit so a crash cannot split them.
 */
export async function saveCashTransaction(
  ctx: StoreContext,
  input: CashTransactionInput,
): Promise<LocalCashTransaction> {
  if (input.photo && !planLimits(ctx.plan).walletPhotos)
    throw new Error("Adding wallet photos requires Pro.");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount.");
  const fee = input.service_fee == null ? 0 : Number(input.service_fee);
  if (!Number.isFinite(fee) || fee < 0) throw new Error("Enter a valid service fee.");
  const drawer = input.drawer_effect == null ? null : Number(input.drawer_effect);
  if (drawer != null && !Number.isFinite(drawer)) throw new Error("Invalid drawer cash effect.");
  const now = nowIso();
  const row: LocalCashTransaction = {
    id: uuid(),
    store_id: ctx.storeId,
    transaction_type: input.transaction_type,
    provider: input.provider,
    customer_name: input.customer_name?.trim() || null,
    customer_mobile_number: input.customer_mobile_number?.trim() || null,
    amount,
    service_fee: fee,
    reference_number: input.reference_number?.trim() || null,
    notes: input.notes?.trim() || null,
    wallet_before: null,
    wallet_after: null,
    cash_before: null,
    cash_after: null,
    drawer_effect: drawer == null ? null : fromCents(toCents(drawer)),
    status: "completed",
    created_by: ctx.userId,
    created_at: now,
    updated_at: now,
    sync_status: "pending",
  };
  await atomic(["cash_transactions", "cash_photos"], async () => {
    await db().cash_transactions.put(row);
    if (input.photo) await putCashPhoto(ctx, row.id, input.photo);
    await enqueue("cash_transactions", row.id);
    await logAudit(ctx, "cash.recorded", "cash_transaction", row.id, {
      transaction_type: row.transaction_type,
      provider: row.provider,
      amount: row.amount,
    });
  });
  return row;
}

/* ------------------------------------------- device-only receipt photos */

/** Stores (or replaces) the photo attached to a cash transaction. Local only. */
export async function putCashPhoto(
  ctx: StoreContext,
  cashTransactionId: string,
  blob: Blob,
): Promise<LocalCashPhoto> {
  if (!planLimits(ctx.plan).walletPhotos) throw new Error("Adding wallet photos requires Pro.");
  return db().transaction("rw", db().cash_transactions, db().cash_photos, async () => {
    const transaction = await db().cash_transactions.get(cashTransactionId);
    if (!transaction || transaction.store_id !== ctx.storeId)
      throw new Error("Cash entry not found in this store.");
    const existing = await db()
      .cash_photos.where("cash_transaction_id")
      .equals(cashTransactionId)
      .toArray();
    if (existing.length) await db().cash_photos.bulkDelete(existing.map((p) => p.id));
    const row: LocalCashPhoto = {
      id: uuid(),
      store_id: ctx.storeId,
      cash_transaction_id: cashTransactionId,
      blob,
      content_type: blob.type || "image/jpeg",
      size: blob.size,
      created_at: nowIso(),
    };
    await db().cash_photos.put(row);
    return row;
  });
}

export async function getCashPhoto(cashTransactionId: string): Promise<LocalCashPhoto | null> {
  const rows = await db()
    .cash_photos.where("cash_transaction_id")
    .equals(cashTransactionId)
    .toArray();
  return rows[0] ?? null;
}

/** Ids of every cash transaction on this device that has a photo attached. */
export async function listCashPhotoIds(storeId: string): Promise<string[]> {
  const rows = await db().cash_photos.where("store_id").equals(storeId).toArray();
  return rows.map((r) => r.cash_transaction_id);
}

export async function deleteCashPhoto(cashTransactionId: string): Promise<void> {
  const rows = await db()
    .cash_photos.where("cash_transaction_id")
    .equals(cashTransactionId)
    .toArray();
  if (rows.length) await db().cash_photos.bulkDelete(rows.map((r) => r.id));
}

/* -------------------------------------------- device-only product photos */

/** Stores (or replaces) the photo attached to a product. Local only. */
export async function putProductPhoto(
  storeId: string,
  productId: string,
  blob: Blob,
): Promise<void> {
  const existing = await db().product_photos.where("product_id").equals(productId).toArray();
  if (existing.length) await db().product_photos.bulkDelete(existing.map((p) => p.id));
  await db().product_photos.put({
    id: uuid(),
    store_id: storeId,
    product_id: productId,
    blob,
    content_type: blob.type || "image/jpeg",
    size: blob.size,
    created_at: nowIso(),
  });
}

export async function getProductPhoto(productId: string): Promise<Blob | null> {
  const rows = await db().product_photos.where("product_id").equals(productId).toArray();
  return rows[0]?.blob ?? null;
}

export async function deleteProductPhoto(productId: string): Promise<void> {
  const rows = await db().product_photos.where("product_id").equals(productId).toArray();
  if (rows.length) await db().product_photos.bulkDelete(rows.map((r) => r.id));
}

/* ------------------------------------------------- manual wallet balance */

/** Current e-wallet balance derived from all non-drawer cash entries. */
export async function walletBalance(storeId: string): Promise<number> {
  const rows = await db().cash_transactions.where("store_id").equals(storeId).toArray();
  return rows
    .filter((r) => r.provider !== "other" && r.status !== "voided")
    .reduce((sum, r) => sum + (r.transaction_type === "cash_in" ? r.amount : -r.amount), 0);
}

/* ---------------------------------------------------------- credit ledger */

export interface CustomerInput {
  id?: string;
  name: string;
  mobile_number?: string | null;
  notes?: string | null;
}

export async function saveCustomer(
  ctx: StoreContext,
  input: CustomerInput,
): Promise<LocalCustomer> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter the customer's name.");
  const existing = input.id ? await db().customers.get(input.id) : undefined;
  const row: LocalCustomer = {
    id: existing?.id ?? uuid(),
    store_id: ctx.storeId,
    name,
    mobile_number: input.mobile_number?.trim() || null,
    notes: input.notes?.trim() || null,
    credit_balance: existing?.credit_balance ?? 0,
    is_active: existing?.is_active ?? true,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    sync_status: "pending",
  };
  await db().customers.put(row);
  await enqueue("customers", row.id);
  await logAudit(ctx, existing ? "customer.updated" : "customer.created", "customer", row.id, {
    name: row.name,
  });
  return row;
}

async function writeCustomerLedger(
  ctx: StoreContext,
  customerId: string,
  /** Positive = payment received, negative = manual charge. */
  amount: number,
  notes: string | null,
  action: string,
  method: RepaymentMethod | null = null,
): Promise<LocalCustomerPayment> {
  const row: LocalCustomerPayment = {
    id: uuid(),
    store_id: ctx.storeId,
    customer_id: customerId,
    sale_id: null,
    amount,
    payment_method: method,
    notes,
    created_by: ctx.userId,
    created_at: nowIso(),
    sync_status: "pending",
  };

  await atomic(["customer_payments", "customers"], async () => {
    const local = db();
    const customer = await local.customers.get(customerId);
    if (!customer || customer.store_id !== ctx.storeId)
      throw new Error("Customer not found in this store.");
    await local.customer_payments.put(row);
    await local.customers.update(customerId, {
      credit_balance: customer.credit_balance - amount,
      updated_at: nowIso(),
      sync_status: "pending",
    });
    const group = row.id;
    await enqueue("customers", customerId, { groupId: group });
    await enqueue("customer_payments", row.id, { groupId: group });
    await logAudit(ctx, action, "customer_payment", row.id, { customer_id: customerId, amount });
  });
  return row;
}

const REPAYMENT = new Set<RepaymentMethod>(["cash", "gcash", "maya", "bank", "other"]);

/** Money received from a customer against their utang. */
export async function recordCustomerPayment(
  ctx: StoreContext,
  input: {
    customer_id: string;
    amount: number;
    payment_method: RepaymentMethod;
    notes?: string | null;
  },
): Promise<LocalCustomerPayment> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount.");
  if (!REPAYMENT.has(input.payment_method)) throw new Error("Choose how the payment was received.");
  return writeCustomerLedger(
    ctx,
    input.customer_id,
    amount,
    input.notes?.trim() || null,
    "customer.payment",
    input.payment_method,
  );
}

/** A charge added by hand (not from a sale) — increases what the customer owes. */
export async function addManualCharge(
  ctx: StoreContext,
  input: { customer_id: string; amount: number; notes?: string | null },
): Promise<LocalCustomerPayment> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount.");
  return writeCustomerLedger(
    ctx,
    input.customer_id,
    -amount,
    input.notes?.trim() || null,
    "customer.charge",
  );
}

/** Charges minus payments, derived locally so devices cannot drift apart. */
export function deriveBalance(charges: { total: number }[], ledger: { amount: number }[]): number {
  const charged = charges.reduce((s, c) => s + c.total, 0);
  const net = ledger.reduce((s, l) => s + l.amount, 0);
  return charged - net;
}

/** Store-scoped drawer summary from everything on this device. */
export async function loadDrawer(storeId: string): Promise<DrawerSummary> {
  const local = db();
  const by = <T>(t: { where(k: string): { equals(v: string): { toArray(): Promise<T[]> } } }) =>
    t.where("store_id").equals(storeId).toArray();
  const [movements, sales, payments, cashTransactions, expenses] = await Promise.all([
    by<LocalDrawerMovement>(local.cash_drawer_movements),
    by<LocalSale>(local.sales),
    by<LocalCustomerPayment>(local.customer_payments),
    by<LocalCashTransaction>(local.cash_transactions),
    by<LocalExpense>(local.expenses),
  ]);
  return computeDrawer({ storeId, movements, sales, payments, cashTransactions, expenses });
}
