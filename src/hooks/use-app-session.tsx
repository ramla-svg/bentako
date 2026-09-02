import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { db, getSetting, setSetting } from "@/lib/local-db";
import { pullAll, startSyncEngine, isOnline } from "@/lib/sync-service";
import type { StoreContext } from "@/lib/repo";

export type Role = "owner" | "cashier";

export interface StoreProfile {
  id: string;
  name: string;
  owner_name: string | null;
  logo_url: string | null;
  currency: string;
  receipt_footer: string | null;
  allow_negative_stock: boolean;
  default_low_stock_threshold: number;
  confirm_void: boolean;
}

interface Snapshot {
  userId: string;
  userName: string | null;
  role: Role;
  store: StoreProfile | null;
}

type Status = "loading" | "signed-out" | "no-store" | "ready";

interface AppSessionValue {
  status: Status;
  userId: string | null;
  userName: string | null;
  email: string | null;
  role: Role;
  store: StoreProfile | null;
  ctx: StoreContext | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppSessionContext = createContext<AppSessionValue | null>(null);

const SNAPSHOT_KEY = "session_snapshot";

/**
 * Never let a hung promise (Supabase auth lock, blocked IndexedDB) freeze the
 * splash screen — every await in the boot path is time-boxed.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        done(value);
      },
      () => {
        clearTimeout(timer);
        done(fallback);
      },
    );
  });
}

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    const readCache = () =>
      withTimeout<Snapshot | null>(getSetting<Snapshot | null>(SNAPSHOT_KEY, null), 4000, null);

    // Open from IndexedDB before touching Supabase. A returning store must not
    // wait for DNS, token refresh, or navigator.onLine to be accurate before it
    // can reach the POS. Explicit sign-out deletes this snapshot first.
    const cached = await readCache();
    if (cached?.userId && cached.store?.id) {
      setSnapshot(cached);
      setStatus("ready");
    } else if (cached?.userId) {
      setSnapshot(cached);
      setStatus("no-store");
    }

    let session = null as Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
    try {
      const data = await withTimeout(
        supabase.auth.getSession().then((r) => r.data),
        8000,
        { session: null },
      );
      session = data.session;
    } catch {
      session = null;
    }

    if (!session) {
      // A cached device remains usable if auth storage is temporarily
      // unavailable or a refresh cannot reach Supabase. signOut() clears the
      // snapshot, so this cannot undo an intentional logout.
      if (cached) {
        setSnapshot(cached);
        setStatus(cached.store ? "ready" : "no-store");
        return;
      }
      setSnapshot(null);
      setStatus("signed-out");
      return;
    }

    setEmail(session.user.email ?? null);

    // Keep the local snapshot while the cloud refresh runs in the background.
    if (cached && cached.userId === session.user.id) {
      setSnapshot(cached);
      setStatus(cached.store ? "ready" : "no-store");
    }


    // 2. Refresh from the cloud when we can reach it.
    if (isOnline()) {
      type ProfileRow = { full_name: string | null; store_id: string | null };
      let profile: ProfileRow | null = null;
      let roles: { role: string }[] = [];
      let reachedCloud = true;
      try {
        const [profileRes, rolesRes] = await withTimeout(
          Promise.all([
            supabase
              .from("profiles")
              .select("id, full_name, store_id")
              .eq("id", session.user.id)
              .maybeSingle(),
            supabase.from("user_roles").select("role").eq("user_id", session.user.id),
          ]),
          10000,
          [
            { data: null, error: { message: "timeout" } },
            { data: null, error: { message: "timeout" } },
          ] as never,
        );
        if (profileRes.error || rolesRes.error) reachedCloud = false;
        profile = (profileRes.data as ProfileRow | null) ?? null;
        roles = (rolesRes.data as { role: string }[] | null) ?? [];
      } catch {
        reachedCloud = false;
      }


      // Network said "online" but the request failed: never downgrade a working
      // offline session (that would bounce the cashier into onboarding).
      if (!reachedCloud) {
        if (cached) {
          setSnapshot(cached);
          setStatus(cached.store ? "ready" : "no-store");
        } else {
          setStatus("no-store");
        }
        return;
      }

      let store: StoreProfile | null = null;
      if (profile?.store_id) {
        const storeRow = await withTimeout(
          Promise.resolve().then(async () => {
            const result = await supabase
              .from("stores")
              .select(
                "id, name, owner_name, logo_url, currency, receipt_footer, allow_negative_stock, default_low_stock_threshold, confirm_void",
              )
              .eq("id", profile.store_id!)
              .maybeSingle();
            return result.data;
          }),
          10000,
          null,
        );

        if (storeRow) store = storeRow as StoreProfile;
        else if (cached?.store) store = cached.store; // store row unreachable — keep local copy
      }
      const role: Role = roles.some((r) => r.role === "owner") ? "owner" : "cashier";
      const fresh: Snapshot = {
        userId: session.user.id,
        userName: profile?.full_name || session.user.email || null,
        role,
        store,
      };
      await withTimeout(setSetting(SNAPSHOT_KEY, fresh), 4000, undefined as void);
      setSnapshot(fresh);
      setStatus(store ? "ready" : "no-store");
      if (store) void pullAll(store.id);
    } else if (!cached) {
      setStatus("no-store");
    }

  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().catch(() => {
      // Boot must never end on the splash screen: fall back to sign-in.
      if (!cancelled) setStatus((s) => (s === "loading" ? "signed-out" : s));
    });
    // Last-resort watchdog for anything that neither resolves nor rejects.
    const watchdog = window.setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "loading" ? "signed-out" : s));
    }, 12000);
    const stop = startSyncEngine();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void load();
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      sub.subscription.unsubscribe();
      stop();
    };
  }, [load]);


  const signOut = useCallback(async () => {
    // Remove offline access before notifying Supabase, so an auth event racing
    // this call cannot reopen the cached store after an intentional logout.
    await db().settings.delete(SNAPSHOT_KEY);
    setSnapshot(null);
    setStatus("signed-out");
    await withTimeout(supabase.auth.signOut().then(() => undefined), 8000, undefined);
  }, []);

  const value = useMemo<AppSessionValue>(
    () => ({
      status,
      userId: snapshot?.userId ?? null,
      userName: snapshot?.userName ?? null,
      email,
      role: snapshot?.role ?? "cashier",
      store: snapshot?.store ?? null,
      ctx: snapshot?.store
        ? { storeId: snapshot.store.id, userId: snapshot.userId, userName: snapshot.userName }
        : null,
      refresh: load,
      signOut,
    }),
    [status, snapshot, email, load, signOut],
  );

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession(): AppSessionValue {
  const ctx = useContext(AppSessionContext);
  if (!ctx) throw new Error("useAppSession must be used inside AppSessionProvider");
  return ctx;
}
