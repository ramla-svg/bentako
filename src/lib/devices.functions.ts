/**
 * How many phones one shop may use, and how many cashier sign-ins it may have.
 *
 * Free = 1 phone, owner only. BentaKo Pro = 3 phones and 2 cashiers.
 * Nothing is ever deleted automatically: when a shop is at its limit the app
 * asks the owner to release a phone or to go Pro.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN_LIMITS, activePlan } from "@/lib/plan";

export interface StoreDevice {
  id: string;
  device_id: string;
  label: string | null;
  last_seen_at: string;
  created_at: string;
  current: boolean;
}

export interface DeviceCheck {
  status: "ok" | "device_limit" | "cashier_limit";
  plan: "free" | "pro";
  limit: number;
  devices: StoreDevice[];
}

async function storeOf(supabase: {
  from: (t: string) => any;
}, userId: string): Promise<{ storeId: string | null; role: string }> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("store_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const isOwner = ((roles ?? []) as { role: string }[]).some((r) => r.role === "owner");
  return { storeId: (profile as { store_id: string | null } | null)?.store_id ?? null, role: isOwner ? "owner" : "cashier" };
}

/** Record this phone against the shop, or report that the plan is full. */
export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deviceId: string; label?: string }) => {
    if (!input?.deviceId) throw new Error("Missing device id");
    return { deviceId: input.deviceId.slice(0, 80), label: (input.label ?? "").slice(0, 60) };
  })
  .handler(async ({ data, context }): Promise<DeviceCheck> => {
    const { supabase, userId } = context;
    const { storeId, role } = await storeOf(supabase as never, userId);
    if (!storeId) return { status: "ok", plan: "free", limit: 1, devices: [] };

    const { data: store } = await supabase
      .from("stores")
      .select("plan, plan_expires_at")
      .eq("id", storeId)
      .maybeSingle();
    const plan = activePlan(store as never);
    const limits = PLAN_LIMITS[plan];

    const { data: rows } = await supabase
      .from("store_devices")
      .select("id, device_id, label, last_seen_at, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    const list = (rows ?? []) as Omit<StoreDevice, "current">[];
    const devices: StoreDevice[] = list.map((row) => ({
      ...row,
      current: row.device_id === data.deviceId,
    }));

    // Cashier seats: Free is owner-only, Pro allows 2 cashier sign-ins.
    if (role === "cashier") {
      const { data: staff } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("store_id", storeId);
      const cashiers = Array.from(
        new Set(
          ((staff ?? []) as { user_id: string; role: string }[])
            .filter((r) => r.role === "cashier")
            .map((r) => r.user_id),
        ),
      );
      const index = cashiers.indexOf(userId);
      const seat = index === -1 ? cashiers.length : index;
      if (seat >= limits.cashiers) {
        return { status: "cashier_limit", plan, limit: limits.cashiers, devices };
      }
    }

    const existing = devices.find((row) => row.current);
    if (existing) {
      await supabase
        .from("store_devices")
        .update({ last_seen_at: new Date().toISOString(), label: data.label || existing.label })
        .eq("id", existing.id);
      return { status: "ok", plan, limit: limits.devices, devices };
    }

    if (devices.length >= limits.devices) {
      return { status: "device_limit", plan, limit: limits.devices, devices };
    }

    const { data: inserted } = await supabase
      .from("store_devices")
      .insert({
        store_id: storeId,
        device_id: data.deviceId,
        label: data.label || null,
        user_id: userId,
      })
      .select("id, device_id, label, last_seen_at, created_at")
      .maybeSingle();

    return {
      status: "ok",
      plan,
      limit: limits.devices,
      devices: inserted
        ? [...devices, { ...(inserted as Omit<StoreDevice, "current">), current: true }]
        : devices,
    };
  });

export const listStoreDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoreDevice[]> => {
    const { supabase, userId } = context;
    const { storeId } = await storeOf(supabase as never, userId);
    if (!storeId) return [];
    const { data } = await supabase
      .from("store_devices")
      .select("id, device_id, label, last_seen_at, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    return ((data ?? []) as Omit<StoreDevice, "current">[]).map((row) => ({ ...row, current: false }));
  });

/** Free a slot. Only rows of the caller's own shop are visible to RLS. */
export const releaseDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing device");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("store_devices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
