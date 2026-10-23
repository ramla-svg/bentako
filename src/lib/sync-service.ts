import { supabase } from "@/integrations/supabase/client";
import {
  isOnline as networkIsOnline,
  probeReachable,
  subscribeNetwork,
} from "@/lib/platform/network-service";

import { db, setSetting, type SyncEntity, type SyncQueueItem } from "./local-db";
import { nowIso, uuid } from "./ids";

/**
 * Sync order respects foreign keys (sales before sale_items, etc.).
 * `audit_logs` is deliberately absent: activity logs are device-only, so they
 * are neither pushed nor pulled.
 */
const ENTITY_ORDER: SyncEntity[] = [
  "categories",
  "products",
  "customers",
  "sales",
  "sale_items",
  "inventory_movements",
  "expenses",
  "cash_transactions",
  "customer_payments",
  "cash_drawer_movements",
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
  "service_fee",
  "credit_balance",
  "wallet_before",
  "wallet_after",
  "cash_before",
  "cash_after",
  "drawer_effect",
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
  backupEnabled: boolean;
  authRequired: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: SyncState = {
  connection: "online",
  pending: 0,
  failed: 0,
  lastSync: null,
  lastIssue: null,
  backupEnabled: false,
  authRequired: false,
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
  if (isAuthError({ message }))
    return "Reconnect your cloud account. Your records stay on this device.";
  if (/permission|policy|denied|row.level security|42501|403/i.test(message))
    return "Cloud access was refused for this shop. Your records stay on this device.";
  return "Some records could not be uploaded yet. They are safe on this device.";
}

function isNetworkError(message: string): boolean {
  return /fetch|network|Load failed|time.?out|abort|ERR_|429|502|503|504/i.test(message);
}

type UploadError = { message: string; code?: string; status?: number };

function isAuthError(error: UploadError): boolean {
  return (
    error.status === 401 ||
    /PGRST30[123]/i.test(error.code ?? "") ||
    /jwt|401|refresh.?token|invalid.?token|session.*expired/i.test(error.message)
  );
}

/** Auth locks and interrupted requests must never leave sync busy forever. */
async function bounded<T>(promise: PromiseLike<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Network timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function cloudSession(refresh = false) {
  const result = await bounded(supabase.auth.getSession(), 8000);
  if (result.error) throw new Error(result.error.message);
  let session = result.data.session;
  if (session && (refresh || (session.expires_at ?? 0) <= Date.now() / 1000 + 60)) {
    const refreshed = await bounded(supabase.auth.refreshSession(), 8000);
    if (refreshed.error) throw new Error(refreshed.error.message);
    session = refreshed.data.session;
  }
  return session;
}

/* ------------------------------------------------------------- connectivity */

/** Connectivity always comes from the network service (Capacitor-swappable). */
export function isOnline(): boolean {
  return networkIsOnline();
}

/**
 * Cloud backup is a paid feature. On the Free plan nothing is pushed or pulled:
 * records stay queued on the device, so upgrading later uploads the backlog.
 */
let cloudBackupEnabled = false;
let activeStoreId: string | null = null;
let activeUserId: string | null = null;
let contextVersion = 0;
let uploadController: AbortController | null = null;
let pullController: AbortController | null = null;

/** Resolved AppSessionProvider identity owns upload scope, not old queue rows. */
export function setSyncContext(userId: string | null, storeId: string | null): void {
  if (activeUserId === userId && activeStoreId === storeId) return;
  activeUserId = userId;
  activeStoreId = storeId;
  contextVersion += 1;
  uploadController?.abort();
  pullController?.abort();
  emit({ authRequired: false, lastIssue: null, lastSync: null, pending: 0, failed: 0 });
  void refreshPending();
}

export function setCloudBackupEnabled(enabled: boolean): void {
  const changed = cloudBackupEnabled !== enabled;
  cloudBackupEnabled = enabled;
  if (changed) {
    contextVersion += 1;
    uploadController?.abort();
    pullController?.abort();
    emit({ backupEnabled: enabled, authRequired: false, lastIssue: null });
    void refreshPending();
  }
  if (changed && enabled) void syncNow();
}

export function isCloudBackupEnabled(): boolean {
  return cloudBackupEnabled;
}

/** Checkout sets this so a sync pass never competes with an in-flight sale. */
let criticalDepth = 0;
const criticalIdleListeners = new Set<() => void>();

export function beginCriticalWork(): void {
  criticalDepth += 1;
}

export function endCriticalWork(): void {
  criticalDepth = Math.max(0, criticalDepth - 1);
  if (criticalDepth === 0) {
    void syncNow();
    for (const fn of [...criticalIdleListeners]) fn();
  }
}

/** True while a sale/checkout write is in flight — never interrupt it. */
export function isCriticalWork(): boolean {
  return criticalDepth > 0;
}

/** Runs once as soon as no sale write is in flight (immediately if idle). */
export function onCriticalWorkIdle(fn: () => void): () => void {
  if (criticalDepth === 0) {
    fn();
    return () => {};
  }
  const wrapped = () => {
    criticalIdleListeners.delete(wrapped);
    fn();
  };
  criticalIdleListeners.add(wrapped);
  return () => criticalIdleListeners.delete(wrapped);
}

async function countQueue() {
  const all = (await db().sync_queue.toArray()).filter(inScope);
  return { pending: all.length, failed: all.filter((i) => i.status === "failed").length };
}

function inScope(item: SyncQueueItem): boolean {
  return (
    !!activeStoreId &&
    item.payload["store_id"] === activeStoreId &&
    ENTITY_ORDER.includes(item.entity)
  );
}

async function refreshPending() {
  const { pending, failed } = await countQueue();
  emit({
    pending,
    failed: cloudBackupEnabled ? failed : 0,
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
    // New intent: invalidates any in-flight attempt for this record.
    attempt_token: null,
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

function attemptChanged(current: SyncQueueItem | undefined, attemptToken: string): boolean {
  return !current || current.attempt_token !== attemptToken;
}

/**
 * Atomically reads the current queue item + local row and marks the attempt.
 * Returns null when there is nothing to upload (item gone or record removed).
 */
export async function claimAttempt(
  snapshot: SyncQueueItem,
  attemptToken: string,
  storeId?: string,
): Promise<{ item: SyncQueueItem; row: Record<string, unknown> } | null> {
  const local = db();
  return local.transaction("rw", [local.sync_queue, local.table(snapshot.entity)], async () => {
    const item = await local.sync_queue.get(snapshot.id);
    if (!item) return null;
    const current = (await local.table(item.entity).get(item.entity_id)) as
      Record<string, unknown> | undefined;
    const row = current ? stripLocalFields(current) : item.payload;
    if (storeId && row["store_id"] !== storeId) return null;
    if (!current && Object.keys(row).length === 0) {
      // Nothing left locally and no snapshot: the record was removed.
      await local.sync_queue.delete(item.id);
      return null;
    }
    const attemptAt = nowIso();
    await local.sync_queue.update(item.id, {
      status: "syncing",
      last_attempt_at: attemptAt,
      attempt_token: attemptToken,
    });
    return { item: { ...item, attempt_token: attemptToken }, row };
  });
}

/**
 * Completes a successful upload atomically. If the row was edited and
 * re-queued while the request was in flight, the queue item and the row's
 * pending status are kept so the newer change uploads on the next pass.
 */
export async function finishUpload(item: SyncQueueItem, attemptToken: string): Promise<void> {
  const local = db();
  await local.transaction("rw", [local.sync_queue, local.table(item.entity)], async () => {
    if (attemptChanged(await local.sync_queue.get(item.id), attemptToken)) return;
    await local.table(item.entity).update(item.entity_id, { sync_status: "synced" });
    await local.sync_queue.delete(item.id);
  });
}

/**
 * Records a failed attempt atomically. Skips entirely when newer intent was
 * queued during the request, so that intent keeps its pending status.
 */
export async function failUpload(
  item: SyncQueueItem,
  attemptToken: string,
  message: string,
  network: boolean,
): Promise<"superseded" | "retry-later" | "failed"> {
  const local = db();
  return local.transaction("rw", [local.sync_queue, local.table(item.entity)], async () => {
    const current = await local.sync_queue.get(item.id);
    if (!current || attemptChanged(current, attemptToken)) return "superseded";
    if (network) {
      // Connectivity/auth failure is not a data failure: stay pending.
      await local.sync_queue.update(item.id, {
        status: "pending",
        last_error: message,
        attempt_token: null,
        updated_at: nowIso(),
      });
      await local.table(item.entity).update(item.entity_id, { sync_status: "pending" });
      return "retry-later";
    }
    await local.sync_queue.update(item.id, {
      status: "failed",
      retry_count: current.retry_count + 1,
      last_error: message,
      attempt_token: null,
      updated_at: nowIso(),
    });
    await local.table(item.entity).update(item.entity_id, { sync_status: "failed" });
    return "failed";
  });
}

/** Exponential backoff so a permanently-failing row can't hammer the network. */
function isBackedOff(item: SyncQueueItem): boolean {
  if (item.status !== "failed" || item.retry_count === 0) return false;
  // Old versions counted expired sessions as rejected data. A usable session
  // should retry those records immediately, without deleting their intent.
  if (item.last_error && isAuthError({ message: item.last_error })) return false;
  const waitMs = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(item.retry_count - 1, 6));
  const since = new Date(item.last_attempt_at ?? item.updated_at).getTime();
  return Date.now() - since < waitMs;
}

let activeRun: Promise<void> | null = null;

export interface SyncOptions {
  retryFailed?: boolean;
}

/** Drain the queue. Safe to call often; never throws to the caller. */
export function syncNow(options: SyncOptions = {}): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!cloudBackupEnabled || !activeStoreId || !activeUserId || !isOnline() || criticalDepth > 0) {
    return refreshPending();
  }
  if (activeRun) return activeRun;
  activeRun = drainQueue(options).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function drainQueue(options: SyncOptions): Promise<void> {
  const version = contextVersion;
  const storeId = activeStoreId;
  const userId = activeUserId;
  const stillCurrent = () => version === contextVersion && cloudBackupEnabled;
  try {
    if (!cloudBackupEnabled || !storeId || !userId || criticalDepth > 0) return;
    if (!isOnline()) {
      emit({ connection: "offline" });
      return;
    }
    const all = (await db().sync_queue.toArray()).filter(inScope);
    if (all.length === 0) return;
    // Do not rotate a usable sign-in merely because Retry was tapped. Refresh
    // near expiry or after a confirmed auth rejection, not a data rejection.
    const session = await cloudSession();
    if (!stillCurrent()) return;
    if (!session || session.user.id !== userId) {
      emit({
        authRequired: true,
        lastIssue: "Reconnect the account for this shop. Your saved records stay here.",
      });
      return;
    }
    emit({ authRequired: false });
    const blockedGroups = new Set(
      all
        .filter(isBackedOff)
        .map((q) => q.group_id)
        .filter(Boolean),
    );
    const queue = all.filter(
      (item) =>
        options.retryFailed ||
        (!isBackedOff(item) && !(item.group_id && blockedGroups.has(item.group_id))),
    );
    if (queue.length === 0) {
      const failure = all.find((q) => q.last_error)?.last_error;
      emit({ lastIssue: failure ? friendlyIssue(failure) : state.lastIssue });
      return;
    }
    emit({ connection: "syncing" });
    log("start", { queued: all.length, attempting: queue.length });

    // Grouped work (a sale and everything it touched) stays together and keeps
    // FK-safe order inside the group.
    queue.sort(
      (a, b) =>
        ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity) ||
        (a.group_id ?? "").localeCompare(b.group_id ?? "") ||
        a.created_at.localeCompare(b.created_at),
    );

    let networkDown = false;
    let refreshedAfterRejection = false;
    const brokenGroups = new Set<string>();
    let lastIssue: string | null = null;

    for (const snapshot of queue) {
      if (networkDown || !stillCurrent() || criticalDepth > 0) break;
      // Do not attempt dependent group members after a rejection. Cloud upserts
      // are UUID-idempotent, but separate HTTP requests are not an atomic sale.
      if (snapshot.group_id && brokenGroups.has(snapshot.group_id)) continue;

      // Read the CURRENT queue item and local row and mark the attempt in one
      // transaction, so no edit+enqueue can land between the read and the mark.
      const attemptToken = uuid();
      const claim = await claimAttempt(snapshot, attemptToken, storeId);
      if (!claim) continue;
      const { item, row } = claim;

      // Upsert on the client-generated UUID primary key: replaying the same
      // record can never create a second cloud row.
      const upload = async (): Promise<UploadError | null> => {
        const controller = new AbortController();
        uploadController = controller;
        try {
          const res = await bounded(
            supabase
              .from(item.entity)
              .upsert(row as never, { onConflict: "id" })
              .abortSignal(controller.signal),
          );
          return res.error ? { ...res.error, status: res.status } : null;
        } catch (err) {
          return { message: err instanceof Error ? err.message : "Network error" };
        } finally {
          controller.abort();
          if (uploadController === controller) uploadController = null;
        }
      };
      let error = await upload();
      if (error && isAuthError(error) && !refreshedAfterRejection && stillCurrent()) {
        refreshedAfterRejection = true;
        try {
          const refreshed = await cloudSession(true);
          if (refreshed?.user.id === userId && stillCurrent()) error = await upload();
        } catch (err) {
          error = { message: err instanceof Error ? err.message : "Refresh token unavailable" };
        }
      }
      if (!stillCurrent()) {
        await failUpload(item, attemptToken, "Upload interrupted; saved locally", true);
        break;
      }

      if (!error) {
        await finishUpload(item, attemptToken);
        continue;
      }

      lastIssue = friendlyIssue(error.message);
      const network = isNetworkError(error.message);
      const auth = isAuthError(error);
      if (network || auth) networkDown = true;
      if (auth) emit({ authRequired: true });
      if (item.group_id) brokenGroups.add(item.group_id);
      const outcome = await failUpload(item, attemptToken, error.message, network || auth);
      log(outcome, { entity: item.entity, attempt: item.retry_count + 1 });
    }

    const { pending, failed } = await countQueue();
    if (!stillCurrent()) return;
    const stamp = nowIso();
    if (pending === 0) {
      await setSetting("last_sync_at", stamp);
      log("success", { at: stamp });
    }
    emit({
      connection: isOnline() ? "online" : "offline",
      pending,
      failed,
      lastSync: pending === 0 ? stamp : state.lastSync,
      lastIssue: pending === 0 ? null : (lastIssue ?? state.lastIssue),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    log("aborted");
    if (stillCurrent())
      emit({
        connection: isOnline() ? "online" : "offline",
        lastIssue: friendlyIssue(message),
        authRequired: isAuthError({ message }),
      });
  } finally {
    await refreshPending();
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

let activePull: Promise<void> | null = null;
let pullingStore: string | null = null;

/** Retry both directions; a read failure must also be recoverable from Settings. */
export async function retrySync(): Promise<void> {
  await syncNow({ retryFailed: true });
  const storeId = activeStoreId;
  if (storeId && !state.authRequired) await pullAll(storeId);
}

/** Share pulls as well, so startup/reconnect cannot race cloud snapshots. */
export function pullAll(storeId: string): Promise<void> {
  if (activePull) {
    if (pullingStore === storeId) return activePull;
    return activePull.then(() => pullAll(storeId));
  }
  pullingStore = storeId;
  activePull = pullStore(storeId).finally(() => {
    activePull = null;
    pullingStore = null;
  });
  return activePull;
}

/** Pull cloud data locally. Never clobbers local work that has not synced. */
async function pullStore(storeId: string): Promise<void> {
  if (
    typeof window === "undefined" ||
    !isOnline() ||
    !cloudBackupEnabled ||
    storeId !== activeStoreId
  )
    return;
  const version = contextVersion;
  try {
    const session = await cloudSession();
    if (!session || session.user.id !== activeUserId) {
      if (version === contextVersion) emit({ authRequired: true, lastIssue: "Reconnect the account for this shop. Your saved records stay here." });
      return;
    }
  } catch (err) {
    if (version === contextVersion) {
      const message = err instanceof Error ? err.message : "Network error";
      emit({ lastIssue: friendlyIssue(message), authRequired: isAuthError({ message }) });
    }
    return;
  }

  // Push first: a pull must never overwrite a sale or stock change that has not
  // reached the cloud yet.
  await syncNow();
  if (version !== contextVersion || state.authRequired || !cloudBackupEnabled) return;

  try {
    emit({ connection: "syncing" });
    let readIssue: string | null = null;
    for (const entity of ENTITY_ORDER) {
      if (version !== contextVersion || !cloudBackupEnabled || !isOnline()) return;
      const controller = new AbortController();
      pullController = controller;
      const { data, error } = await bounded(
        supabase
          .from(entity)
          .select("*")
          .eq("store_id", storeId)
          .limit(5000)
          .abortSignal(controller.signal),
      ).finally(() => {
        controller.abort();
        if (pullController === controller) pullController = null;
      });
      if (version !== contextVersion) return;
      if (error || !data) {
        readIssue = friendlyIssue(error?.message ?? "Cloud read unavailable");
        if (error && isAuthError(error)) emit({ authRequired: true });
        continue;
      }
      const table = db().table(entity);
      for (const raw of data as Record<string, unknown>[]) {
        const id = raw["id"] as string;
        if (raw["store_id"] !== storeId || version !== contextVersion) continue;
        await db().transaction("rw", [table, db().sync_queue], async () => {
          const queue = (await db().sync_queue.toArray()).filter(inScope);
          if (queue.some((q) => q.entity === entity && q.entity_id === id)) {
            log("conflict-skip", { entity, reason: "local upload pending" });
            return;
          }
          const local = (await table.get(id)) as Record<string, unknown> | undefined;
          if (local) {
            if (local["sync_status"] !== "synced") return; // local edit wins for now
            if (
              entity === "sales" &&
              local["status"] === "completed" &&
              raw["status"] === "completed"
            )
              return; // a completed local sale is never rewritten
            if (
              entity === "products" &&
              queue.some(
                (q) =>
                  q.payload["product_id"] === id &&
                  (q.entity === "inventory_movements" || q.entity === "sale_items"),
              )
            )
              return;
            if (!newerThan(raw, local)) {
              log("conflict-keep-local", { entity });
              return;
            }
          }
          await table.put(coerce(raw));
        });
      }
    }

    const { pending } = await countQueue();
    if (version !== contextVersion) return;
    if (!readIssue && pending === 0) {
      const stamp = nowIso();
      await setSetting("last_sync_at", stamp);
      emit({ lastSync: stamp, lastIssue: null });
    } else if (readIssue) emit({ lastIssue: readIssue });
    emit({ connection: isOnline() ? "online" : "offline" });
    log("pull-complete");
  } catch (err) {
    log("pull-aborted");
    emit({
      connection: isOnline() ? "online" : "offline",
      lastIssue: friendlyIssue(err instanceof Error ? err.message : "Network error"),
    });
  } finally {
    if (version === contextVersion) emit({ connection: isOnline() ? "online" : "offline" });
    await refreshPending();
  }
}

/* ------------------------------------------------------------------- engine */

let started = false;

/** Wire up connection listeners + periodic retry. Call once from the app shell. */
export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};
  // One-time cleanup: activity logs are device-only now, so any rows left in
  // the queue from an older version would never drain. Drop them.
  void db()
    .sync_queue.where("entity")
    .equals("audit_logs")
    .delete()
    .then(() => refreshPending())
    .catch(() => {});
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
    stabilizeTimer = window.setTimeout(async () => {
      log("reconnect-stable");
      // navigator.onLine can be true on a captive portal or dead hotspot. Do
      // not churn queue attempts until the cloud endpoint is actually reachable.
      // A transport probe is not an authentication check. The app's own static
      // endpoint avoids unauthenticated /auth/health requests returning 401.
      const reachable = await probeReachable();
      if (reachable) {
        const storeId = activeStoreId;
        void (async () => {
          await syncNow();
          if (storeId && storeId === activeStoreId) await pullAll(storeId);
        })();
      } else {
        emit({ connection: "offline" });
        log("reconnect-not-reachable");
      }
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

  const unsubscribeNetwork = subscribeNetwork((online) => (online ? onOnline() : onOffline()));
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(() => void syncNow(), 30_000);
  void syncNow();

  return () => {
    unsubscribeNetwork();
    document.removeEventListener("visibilitychange", onVisible);
    window.clearTimeout(stabilizeTimer);
    window.clearInterval(timer);
    started = false;
  };
}
