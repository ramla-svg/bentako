/**
 * Manual GCash billing for BentaKo Pro.
 *
 * Shop owners record what they sent (rows are inserted straight from the app
 * under RLS). Only a BentaKo super admin — an email listed in the
 * SUPER_ADMIN_EMAILS secret — may read every request, approve it and extend a
 * store's Pro end date. No payment provider is involved.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BillingConfig {
  gcashName: string;
  gcashNumber: string;
  gcashQrUrl: string;
}

const CONFIG_KEYS = ["gcash_name", "gcash_number", "gcash_qr_url"] as const;

function adminEmails(): string[] {
  return (process.env["SUPER_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function assertAdmin(claims: Record<string, unknown>): string {
  const email = String(claims["email"] ?? "").toLowerCase();
  if (!email || !adminEmails().includes(email)) throw new Error("Forbidden");
  return email;
}

/** Where shop owners should send the money. Readable by any signed-in user. */
export const getBillingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingConfig> => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("key, value")
      .in("key", CONFIG_KEYS as unknown as string[]);
    const map = new Map((data ?? []).map((row) => [row.key, row.value ?? ""]));
    return {
      gcashName: map.get("gcash_name") ?? "",
      gcashNumber: map.get("gcash_number") ?? "",
      gcashQrUrl: map.get("gcash_qr_url") ?? "",
    };
  });

/** True only for the BentaKo owner accounts; drives the private admin screen. */
export const isBillingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const email = String(context.claims["email"] ?? "").toLowerCase();
    return Boolean(email) && adminEmails().includes(email);
  });

export interface AdminPayment {
  id: string;
  store_id: string;
  store_name: string | null;
  requested_by_email: string | null;
  plan_period: string;
  amount: number;
  reference_code: string;
  gcash_reference: string;
  status: string;
  review_note: string | null;
  proof_url: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export const listPlanPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ pending: AdminPayment[]; recent: AdminPayment[] }> => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("plan_payments")
      .select(
        "id, store_id, store_name, requested_by_email, plan_period, amount, reference_code, gcash_reference, status, review_note, proof_path, created_at, reviewed_at",
      )
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const withUrls = await Promise.all(
      rows.map(async (row) => {
        let proof_url: string | null = null;
        if (row.proof_path) {
          const signed = await supabaseAdmin.storage
            .from("payment-proofs")
            .createSignedUrl(row.proof_path, 900);
          proof_url = signed.data?.signedUrl ?? null;
        }
        const { proof_path: _drop, ...rest } = row;
        return { ...rest, amount: Number(row.amount), proof_url } as AdminPayment;
      }),
    );

    return {
      pending: withUrls.filter((row) => row.status === "pending"),
      recent: withUrls.filter((row) => row.status !== "pending").slice(0, 40),
    };
  });

/** Approve (extend Pro) or reject one payment request. */
export const reviewPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; approve: boolean; note?: string }) => {
    if (!input?.id) throw new Error("Missing payment id");
    return { id: input.id, approve: Boolean(input.approve), note: input.note?.slice(0, 200) ?? "" };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; expiresAt: string | null }> => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment, error } = await supabaseAdmin
      .from("plan_payments")
      .select("id, store_id, plan_period, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) throw new Error("Payment not found");
    if (payment.status !== "pending") throw new Error("This payment was already reviewed");

    let expiresAt: string | null = null;

    if (data.approve) {
      const { data: store } = await supabaseAdmin
        .from("stores")
        .select("plan, plan_expires_at")
        .eq("id", payment.store_id)
        .maybeSingle();

      // Paying again while still active adds to the end date instead of
      // overwriting it, so nobody loses days they already paid for.
      const current =
        store?.plan === "pro" && store?.plan_expires_at
          ? new Date(store.plan_expires_at).getTime()
          : 0;
      const base = Number.isFinite(current) && current > Date.now() ? current : Date.now();
      const days = payment.plan_period === "yearly" ? 365 : 30;
      expiresAt = new Date(base + days * 86_400_000).toISOString();

      const { error: storeError } = await supabaseAdmin
        .from("stores")
        .update({
          plan: "pro",
          plan_period: payment.plan_period,
          plan_expires_at: expiresAt,
          plan_source: "gcash_manual",
        })
        .eq("id", payment.store_id);
      if (storeError) throw new Error(storeError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("plan_payments")
      .update({
        status: data.approve ? "approved" : "rejected",
        review_note: data.note || null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, expiresAt };
  });

/** Save the GCash name, number and QR image link shown to shop owners. */
export const saveBillingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BillingConfig) => ({
    gcashName: (input?.gcashName ?? "").slice(0, 80),
    gcashNumber: (input?.gcashNumber ?? "").slice(0, 40),
    gcashQrUrl: (input?.gcashQrUrl ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = [
      { key: "gcash_name", value: data.gcashName },
      { key: "gcash_number", value: data.gcashNumber },
      { key: "gcash_qr_url", value: data.gcashQrUrl },
    ];
    const { error } = await supabaseAdmin.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Store the GCash QR photo itself (not a link). The image arrives already
 * shrunk by the browser and is kept with the other billing settings, so shop
 * owners see it on the payment sheet without any public file storage.
 */
export const saveBillingQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dataUrl: string }) => {
    const value = input?.dataUrl ?? "";
    if (value && !value.startsWith("data:image/")) throw new Error("That file is not an image");
    if (value.length > 900_000) throw new Error("That photo is too large");
    return { dataUrl: value };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; url: string }> => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert([{ key: "gcash_qr_url", value: data.dataUrl }], { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true, url: data.dataUrl };
  });
