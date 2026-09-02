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

export interface SyncState {
  connection: ConnectionState;
  /** Rows still waiting to reach the cloud (pending + failed). */
  pending: number;
  /** Rows that were rejected by the server and are retrying with backoff. */
  failed: number;
  lastSync: string | null;
  /** Friendly, non-technical description of the last problem. */
  lastIssue: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: SyncState = {
  connection: "online",
  pending: 0,
  failed: 0,
  lastSync: null,
  lastIssue: null,
};

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ logging */

/** Developer-facing sync log. Never logs customer or auth data. */
function log(event: string, detail?: Record<string, unknown>) {
  if (typeof console === "undefined") return;
  console.info(`[sync] ${event}`, detail ?? "");
}

function friendlyIssue(message: string): string {
  if (isNetworkError(message)) return "No stable internet connection yet.";
  if (/permission|policy|denied|jwt|401|403/i.test(message))
    return "Sign in again so this device can upload your records.";
  return "Some records could not be uploaded yet. They are safe on this device.";
}

function isNetworkError(message: string): boolean {
  return /fetch|network|Load failed|timeout|abort|ERR_|502|503|504/i.test(message);
}

/* ------------------------------------------------------------- connectivity */

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Checkout sets this so a sync pass never competes with an in-flight sale. */
let criticalDepth = 0;

export function beginCriticalWork(): void {
  criticalDepth += 1;
}

export function endCriticalWork(): void {
  criticalDepth = Math.max(0, criticalDepth - 1);
  if (criticalDepth === 0) void syncNow();
}

async function countQueue() {
  const all = await db().sync_queue.toArray();
  return { pending: all.length, failed: all.filter((i) => i.status === "failed").length };
}

async function refreshPending() {
  const { pending, failed } = await countQueue();
  emit({
    pending,
    failed,
    connection: isOnline() ? (state.connection === "syncing" ? "syncing" : "online") : "offline",
  });
}

/* -------------------------------------------------------------------- queue */

/**
 * Queue a locally-saved record for cloud upload. The record is ALWAYS already
 * written to IndexedDB before this is called — the queue only carries intent.
 */
export async function enqueue(
  entity: SyncEntity,
  entityId: string,
  options?: { groupId?: string | null },
): Promise<void> {
  const existing = await db().sync_queue.where("entity_id").equals(entityId).first();
  const snapshot = ((await db().table(entity).get(entityId)) as Record<string, unknown>) ?? {};
  const item: SyncQueueItem = {
    id: existing?.id ?? uuid(),
    entity,
    entity_id: entityId,
    operation: "upsert",
    payload: stripLocalFields(snapshot),
    group_id: options?.groupId ?? existing?.group_id ?? null,
    status: "pending",
    retry_count: existing?.retry_count ?? 0,
    last_attempt_at: existing?.last_attempt_at ?? null,
    last_error: null,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
  };
  await db().sync_queue.put(item);
  void refreshPending();
  if (criticalDepth === 0) void syncNow();
}

function stripLocalFields(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy["sync_status"];
  return copy;
}

async function readLocal(
  entity: SyncEntity,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  return (await db().table(entity).get(id)) as Record<string, unknown> | undefined;
}

async function markSynced(entity: SyncEntity, id: string) {
  await db().table(entity).update(id, { sync_status: "synced" });
}

/** Exponential backoff so a permanently-failing row can't hammer the network. */
function isBackedOff(item: SyncQueueItem): boolean {
  if (item.status !== "failed" || item.retry_count === 0) return false;
  const waitMs = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(item.retry_count - 1, 6));
  const since = new Date(item.last_attempt_at ?? item.updated_at).getTime();
  return Date.now() - since < waitMs;
}

let running = false;

/** Drain the queue. Safe to call often; never throws to the caller. */
export async function syncNow(): Promise<void> {
  if (typeof window === "undefined" || running) return;
  if (criticalDepth > 0) return; // never interrupt an active checkout
  if (!isOnline()) {
    emit({ connection: "offline" });
    return;
  }

  let hasSession = false;
  try {
    const { data } = await supabase.auth.getSession();
    hasSession = !!data.session;
  } catch {
    hasSession = false;
  }
  if (!hasSession) {
    await refreshPending();
    return;
  }

  running = true;
  try {
    const all = await db().sync_queue.toArray();
    const queue = all.filter((item) => !isBackedOff(item));
    if (queue.length === 0) {
      await refreshPending();
      return;
    }
    emit({ connection: "syncing" });
    log("start", { queued: all.length, attempting: queue.length });

    // Grouped work (a sale and everything it touched) stays together and keeps
    // FK-safe order inside the group.
    queue.sort(
      (a, b) =>
        (a.group_id ?? "").localeCompare(b.group_id ?? "") ||
        ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity) ||
        a.created_at.localeCompare(b.created_at),
    );

    let networkDown = false;
    const brokenGroups = new Set<string>();
    let lastIssue: string | null = null;

    for (const item of queue) {
      if (networkDown) break;
      // A group is atomic: if one member is rejected, stop pushing the rest so
      // the cloud never ends up with a sale header and no items.
      if (item.group_id && brokenGroups.has(item.group_id)) continue;

      const local = await readLocal(item.entity, item.entity_id);
      const row = local ? stripLocalFields(local) : item.payload;
      if (!local && Object.keys(row).length === 0) {
        // Nothing left locally and no snapshot: the record was removed.
        await db().sync_queue.delete(item.id);
        continue;
      }

      await db().sync_queue.update(item.id, {
        status: "syncing",
        last_attempt_at: nowIso(),
        updated_at: nowIso(),
      });

      // Upsert on the client-generated UUID primary key: replaying the same
      // record can never create a second cloud row.
      let error: { message: string } | null = null;
      try {
        const res = await supabase
          .from(item.entity)
          .upsert(row as never, { onConflict: "id" });
        error = res.error;
      } catch (err) {
        error = { message: err instanceof Error ? err.message : "Network error" };
      }

      if (!error) {
        await markSynced(item.entity, item.entity_id);
        await db().sync_queue.delete(item.id);
        continue;
      }

      lastIssue = friendlyIssue(error.message);
      if (isNetworkError(error.message)) {
        // Connectivity failure is not a data failure: stay pending, retry later.
        networkDown = true;
        if (item.group_id) brokenGroups.add(item.group_id);
        await db().sync_queue.update(item.id, {
          status: "pending",
          last_error: error.message,
          updated_at: nowIso(),
        });
        log("retry-later", { entity: item.entity, reason: "network" });
        continue;
      }

      if (item.group_id) brokenGroups.add(item.group_id);
      await db().sync_queue.update(item.id, {
        status: "failed",
        retry_count: item.retry_count + 1,
        last_error: error.message,
        updated_at: nowIso(),
      });
      await db().table(item.entity).update(item.entity_id, { sync_status: "failed" });
      log("failed", { entity: item.entity, attempt: item.retry_count + 1 });
    }

    const { pending, failed } = await countQueue();
    const stamp = nowIso();
    if (pending === 0) {
      await setSetting("last_sync_at", stamp);
      log("success", { at: stamp });
    }
    emit({
      connection: isOnline() ? "online" : "offline",
      pending,
      failed,
      lastSync: stamp,
      lastIssue: pending === 0 ? null : lastIssue,
    });
  } catch (err) {
    log("aborted", { message: err instanceof Error ? err.message : "unknown" });
    emit({ connection: isOnline() ? "online" : "offline" });
  } finally {
    running = false;
    void refreshPending();
  }
}

/* --------------------------------------------------------------------- pull */

function coerce(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row, sync_status: "synced" };
  for (const key of Object.keys(out)) {
    if (NUMERIC_FIELDS.has(key) && out[key] !== null && out[key] !== undefined) {
      out[key] = Number(out[key]);
    }
  }
  return out;
}

function newerThan(cloud: Record<string, unknown>, local: Record<string, unknown>): boolean {
  const c = String(cloud["updated_at"] ?? cloud["created_at"] ?? "");
  const l = String(local["updated_at"] ?? local["created_at"] ?? "");
  if (!c || !l) return true;
  return c >= l;
}

/** Pull cloud data locally. Never clobbers local work that has not synced. */
export async function pullAll(storeId: string): Promise<void> {
  if (typeof window === "undefined" || !isOnline()) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
  } catch {
    return;
  }

  // Push first: a pull must never overwrite a sale or stock change that has not
  // reached the cloud yet.
  await syncNow();

  try {
    emit({ connection: "syncing" });
    const queue = await db().sync_queue.toArray();
    const queuedIds = new Set(queue.map((q) => q.entity_id));
    // A product with queued stock movements must keep its local quantity.
    const lockedProducts = new Set<string>();
    for (const q of queue) {
      if (q.entity === "inventory_movements" || q.entity === "sale_items") {
        const pid = q.payload["product_id"];
        if (typeof pid === "string") lockedProducts.add(pid);
      }
      if (q.entity === "products") lockedProducts.add(q.entity_id);
    }

    for (const entity of ENTITY_ORDER) {
      const { data, error } = await supabase
        .from(entity)
        .select("*")
        .eq("store_id", storeId)
        .limit(5000);
      if (error || !data) continue;
      const table = db().table(entity);
      for (const raw of data as Record<string, unknown>[]) {
        const id = raw["id"] as string;
        if (queuedIds.has(id)) {
          log("conflict-skip", { entity, reason: "local upload pending" });
          continue;
        }
        const local = (await table.get(id)) as Record<string, unknown> | undefined;
        if (local) {
          if (local["sync_status"] !== "synced") continue; // local edit wins for now
          if (entity === "sales" && local["status"] === "completed" && raw["status"] === "completed")
            continue; // a completed local sale is never rewritten
          if (entity === "products" && lockedProducts.has(id)) continue; // stock ledger pending
          if (!newerThan(raw, local)) {
            log("conflict-keep-local", { entity });
            continue;
          }
        }
        await table.put(coerce(raw));
      }
    }

    await setSetting("last_sync_at", nowIso());
    emit({ connection: isOnline() ? "online" : "offline", lastSync: nowIso() });
    log("pull-complete");
  } catch (err) {
    log("pull-aborted", { message: err instanceof Error ? err.message : "unknown" });
    emit({ connection: isOnline() ? "online" : "offline" });
  } finally {
    void refreshPending();
  }
}

/* ------------------------------------------------------------------- engine */

let started = false;

/** Wire up connection listeners + periodic retry. Call once from the app shell. */
export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};
  void refreshPending();
  if (started) return () => {};
  started = true;

  let stabilizeTimer: number | undefined;

  const onOnline = () => {
    emit({ connection: "online" });
    log("reconnect-detected");
    // Wait for the connection to settle before hitting the network: mobile
    // hotspots fire `online` well before packets actually flow.
    window.clearTimeout(stabilizeTimer);
    stabilizeTimer = window.setTimeout(() => {
      log("reconnect-stable");
      void syncNow();
    }, 2500);
  };
  const onOffline = () => {
    window.clearTimeout(stabilizeTimer);
    emit({ connection: "offline" });
    log("offline");
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && isOnline()) void syncNow();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(() => void syncNow(), 30_000);
  void syncNow();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearTimeout(stabilizeTimer);
    window.clearInterval(timer);
    started = false;
  };
}
