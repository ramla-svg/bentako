/**
 * Account and data deletion (required by Google Play for any app with sign-in).
 *
 * Owner  -> the whole shop is removed: sales, products, cash, utang, expenses,
 *           devices, staff sign-ins and the shop record itself, then the owner's
 *           own login.
 * Cashier -> only that person's sign-in and profile are removed; the shop and
 *           its records stay with the owner.
 *
 * There are no database foreign keys between these tables, so rows are removed
 * table by table in a safe order.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DeleteAccountResult {
  ok: true;
  scope: "store" | "user";
}

/** Tables that hold shop records, deleted by store_id. */
const STORE_TABLES = [
  "audit_logs",
  "sale_items",
  "sales",
  "inventory_movements",
  "customer_payments",
  "customers",
  "cash_transactions",
  "expenses",
  "products",
  "categories",
  "store_devices",
  "plan_payments",
  "user_roles",
] as const;

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) => {
    if ((input?.confirm ?? "").trim().toUpperCase() !== "DELETE") {
      throw new Error("Type DELETE to confirm");
    }
    return { confirm: "DELETE" };
  })
  .handler(async ({ context }): Promise<DeleteAccountResult> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("store_id").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const storeId = (profile as { store_id: string | null } | null)?.store_id ?? null;
    const isOwner = ((roles ?? []) as { role: string }[]).some((r) => r.role === "owner");

    if (storeId && isOwner) {
      // Payment proof images and the shop logo first — they are private files.
      const { data: payments } = await supabaseAdmin
        .from("plan_payments")
        .select("proof_path")
        .eq("store_id", storeId);
      const proofs = ((payments ?? []) as { proof_path: string | null }[])
        .map((row) => row.proof_path)
        .filter((path): path is string => Boolean(path));
      if (proofs.length > 0) {
        await supabaseAdmin.storage.from("payment-proofs").remove(proofs);
      }

      const { data: logos } = await supabaseAdmin.storage.from("store-logos").list(storeId);
      if (logos && logos.length > 0) {
        await supabaseAdmin.storage
          .from("store-logos")
          .remove(logos.map((file) => `${storeId}/${file.name}`));
      }

      for (const table of STORE_TABLES) {
        await supabaseAdmin.from(table).delete().eq("store_id", storeId);
      }

      // Everyone who signed in for this shop loses their profile; their logins
      // are removed too so no orphan account can sign back in.
      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("store_id", storeId);
      const memberIds = ((members ?? []) as { id: string }[]).map((row) => row.id);

      await supabaseAdmin.from("profiles").delete().eq("store_id", storeId);
      await supabaseAdmin.from("stores").delete().eq("id", storeId);

      for (const id of memberIds) {
        if (id === userId) continue;
        await supabaseAdmin.auth.admin.deleteUser(id);
      }
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return { ok: true, scope: "store" };
    }

    await supabaseAdmin.from("store_devices").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { ok: true, scope: "user" };
  });
