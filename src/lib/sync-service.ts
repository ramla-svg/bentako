import { supabase } from "@/integrations/supabase/client";

import { db, setSetting, type SyncEntity, type SyncQueueItem } from "./local-db";
import { nowIso, uuid } from "./ids";

/** Sync order respects foreign keys (sales before sale_items, etc.). */
const ENTITY_ORDER: SyncEntity[] = [
  "categories",
  "products",
  "sales",
  "sale_items",
  "inventory_movements",
  "expenses",
  "audit_logs",
];

const NUMERIC_FIELDS = new Set([
  "cost_price",
  "selling_price",
  "stock_quantity",
  "low_stock_threshold",
  "subtotal",
  "discount",
  "total",
  "cash_received",
  "change_amount",
  "quantity",
  "previous_stock",
  "new_stock",
  "unit_cost",
  "cost_price_snapshot",
  "selling_price_snapshot",
  "amount",
  "sort_order",
]);

export type ConnectionState = "online" | "offline" | "syncing";

type Listener = () => void;

const listeners = new Set<Listener>();

let state: { connection: ConnectionState; pending: number; lastSync: string | null } = {
  connection: "online",
  pending: 0,
  lastSync: null,
};

export function getSyncState() {
  return state;
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function refreshPending() {
  const pending = await db().sync_queue.count();
  emit({ pending, connection: isOnline() ? (state.connection === "syncing" ? "syncing" : "online") : "offline" });
}

/** Queue a locally-saved record for cloud upload. */
export async function enqueue(entity: SyncEntity, entityId: string): Promise<void> {
  const existing = await db().sync_queue.where("entity_id").equals(entityId).first();
  const item: SyncQueueItem = {
    id: existing?.id ?? uuid(),
    entity,
    entity_id: entityId,
    operation: "upsert",
    payload: {},
    status: "pending",
    retry_count: existing?.retry_count ?? 0,
    last_error: null,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
  };
  await db().sync_queue.put(item);
  void refreshPending();
  void syncNow();
}

function stripLocalFields(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy["sync_status"];
  return copy;
}

async function readLocal(entity: SyncEntity, id: string): Promise<Record<string, unknown> | undefined> {
  const table = db().table(entity);
  const row = (await table.get(id)) as Record<string, unknown> | undefined;
  return row;
}

async function markSynced(entity: SyncEntity, id: string) {
  await db().table(entity).update(id, { sync_status: "synced" });
}

let running = false;

/** Exponential backoff so a permanently-failing row can't hammer the network. */
function isBackedOff(item: SyncQueueItem): boolean {
  if (item.status !== "failed" || item.retry_count === 0) return false;
  const waitMs = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(item.retry_count - 1, 6));
  return Date.now() - new Date(item.updated_at).getTime() < waitMs;
}

/** Drain the pending queue. Safe to call often; never throws to the caller. */
export async function syncNow(): Promise<void> {
  if (typeof window === "undefined" || running) return;
  if (!isOnline()) {
    emit({ connection: "offline" });
    return;
  }
  let hasSession = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    hasSession = !!sessionData.session;
  } catch {
    hasSession = false;
  }
  if (!hasSession) {
    await refreshPending();
    return;
  }

  running = true;
  try {
    const queue = (await db().sync_queue.toArray()).filter((item) => !isBackedOff(item));
    if (queue.length === 0) {
      await refreshPending();
      return;
    }
    emit({ connection: "syncing" });

    queue.sort(
      (a, b) =>
        ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity) ||
        a.created_at.localeCompare(b.created_at),
    );

    let networkDown = false;
    for (const item of queue) {
      if (networkDown) break;
      const local = await readLocal(item.entity, item.entity_id);
      if (!local) {
        await db().sync_queue.delete(item.id);
        continue;
      }
      // Upsert on the client-generated UUID primary key: retries can never
      // create a duplicate row in the cloud.
      let error: { message: string } | null = null;
      try {
        const res = await supabase
          .from(item.entity)
          .upsert(stripLocalFields(local) as never, { onConflict: "id" });
        error = res.error;
      } catch (err) {
        error = { message: err instanceof Error ? err.message : "Network error" };
      }

      if (error) {
        // A connectivity failure is not a data failure: leave the row pending so
        // the cashier never sees a scary "failed" badge for a good sale.
        const offlineish = /fetch|network|Load failed|timeout|ERR_/i.test(error.message);
        if (offlineish) {
          networkDown = true;
          await db().sync_queue.update(item.id, {
            status: "pending",
            last_error: error.message,
            updated_at: nowIso(),
          });
          continue;
        }
        await db().sync_queue.update(item.id, {
          status: "failed",
          retry_count: item.retry_count + 1,
          last_error: error.message,
          updated_at: nowIso(),
        });
        await db().table(item.entity).update(item.entity_id, { sync_status: "failed" });
      } else {
        await markSynced(item.entity, item.entity_id);
        await db().sync_queue.delete(item.id);
      }
    }


    const remaining = await db().sync_queue.count();
    const stamp = nowIso();
    if (remaining === 0) await setSetting("last_sync_at", stamp);
    emit({ connection: isOnline() ? "online" : "offline", pending: remaining, lastSync: stamp });
  } catch {
    emit({ connection: isOnline() ? "online" : "offline" });
  } finally {
    running = false;
    void refreshPending();
  }
}


function coerce(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row, sync_status: "synced" };
  for (const key of Object.keys(out)) {
    if (NUMERIC_FIELDS.has(key) && out[key] !== null && out[key] !== undefined) {
      out[key] = Number(out[key]);
    }
  }
  return out;
}

/** Pull cloud data into the local database (never clobbers unsynced local edits). */
export async function pullAll(storeId: string): Promise<void> {
  if (typeof window === "undefined" || !isOnline()) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;
  } catch {
    return;
  }

  // Always push local work first, so a pull can never overwrite a sale or stock
  // change that has not reached the cloud yet.
  await syncNow();

  try {
    emit({ connection: "syncing" });
    const queuedIds = new Set((await db().sync_queue.toArray()).map((q) => q.entity_id));
    for (const entity of ENTITY_ORDER) {
      const query = supabase.from(entity).select("*").eq("store_id", storeId).limit(5000);
      const { data, error } = await query;
      if (error || !data) continue;
      const table = db().table(entity);
      for (const raw of data as Record<string, unknown>[]) {
        const id = raw["id"] as string;
        if (queuedIds.has(id)) continue; // still waiting to upload — local wins
        const local = (await table.get(id)) as { sync_status?: string } | undefined;
        if (local && local.sync_status !== "synced") continue; // keep local pending edits
        await table.put(coerce(raw));
      }
    }

    await setSetting("last_sync_at", nowIso());
    emit({ connection: isOnline() ? "online" : "offline", lastSync: nowIso() });
  } catch {
    emit({ connection: isOnline() ? "online" : "offline" });
  } finally {
    void refreshPending();
  }
}

let started = false;

/** Wire up connection listeners + periodic retry. Call once from the app shell. */
export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};
  void refreshPending();
  if (started) return () => {};
  started = true;

  const onOnline = () => {
    emit({ connection: "online" });
    void syncNow();
  };
  const onOffline = () => emit({ connection: "offline" });

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  const timer = window.setInterval(() => void syncNow(), 30_000);
  void syncNow();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.clearInterval(timer);
    started = false;
  };
}
