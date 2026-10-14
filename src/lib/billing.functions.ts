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
import {
  adminEmailList,
  assertAdminEmail,
  computeAdminMetrics,
  fetchAllPages,
  revokeStorePro,
  subscriberStatus,
  type AdminMetrics,
  type AdminPaymentRow,
  type AdminStoreRow,
  type RevokeInput,
  type SubscriberStatus,
} from "@/lib/admin-subscriptions";

export interface BillingConfig {
  gcashName: string;
  gcashNumber: string;
  gcashQrUrl: string;
}

const CONFIG_KEYS = ["gcash_name", "gcash_number", "gcash_qr_url"] as const;

function adminEmails(): string[] {
  return adminEmailList(process.env["SUPER_ADMIN_EMAILS"]);
}

function assertAdmin(claims: Record<string, unknown>): string {
  return assertAdminEmail(claims, adminEmails());
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
      .limit(40);
    if (error) throw new Error(error.message);
    // Every pending request, not just the newest, so none is hidden.
    const pendingRows = await fetchAllPages((from, to) =>
      supabaseAdmin
        .from("plan_payments")
        .select(
          "id, store_id, store_name, requested_by_email, plan_period, amount, reference_code, gcash_reference, status, review_note, proof_path, created_at, reviewed_at",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(from, to),
    );
    const seen = new Set(pendingRows.map((r) => r.id));
    const rows = [...pendingRows, ...(data ?? []).filter((r) => !seen.has(r.id))];
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

const STORE_COLS =
  "id, name, owner_id, owner_name, plan, plan_period, plan_expires_at, plan_source, created_at";
const PAY_COLS =
  "store_id, amount, status, plan_period, created_at, reviewed_at, requested_by_email";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function loadAll(admin: AdminClient) {
  const [stores, payments] = await Promise.all([
    fetchAllPages<AdminStoreRow>(async (from, to) => {
      const r = await admin.from("stores").select(STORE_COLS).order("created_at").range(from, to);
      return { data: r.data as AdminStoreRow[] | null, error: r.error };
    }),
    fetchAllPages<AdminPaymentRow>(async (from, to) => {
      const r = await admin
        .from("plan_payments")
        .select(PAY_COLS)
        .order("created_at")
        .range(from, to);
      return { data: r.data as AdminPaymentRow[] | null, error: r.error };
    }),
  ]);
  return { stores, payments };
}

/** Subscriber counts and approved subscription revenue across every row. */
export const getAdminMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminMetrics> => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stores, payments } = await loadAll(supabaseAdmin);
    return computeAdminMetrics(stores, payments, Date.now());
  });

export interface AdminStoreListItem extends AdminStoreRow {
  status: SubscriberStatus;
  owner_email: string | null;
}

export const listAdminStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string; status?: string; page?: number }) => ({
    q: String(input?.q ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 80),
    status: ["free", "pro_active", "pro_expired"].includes(String(input?.status))
      ? (input.status as SubscriberStatus)
      : null,
    page: Math.max(0, Math.floor(Number(input?.page) || 0)),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ items: AdminStoreListItem[]; total: number; pageSize: number }> => {
      assertAdmin(context.claims);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { stores, payments } = await loadAll(supabaseAdmin);
      const emails = new Map<string, string>();
      for (const p of payments)
        if (p.requested_by_email) emails.set(p.store_id, p.requested_by_email);
      const now = Date.now();
      const all = stores
        .map((s) => ({
          ...s,
          status: subscriberStatus(s, now),
          owner_email: emails.get(s.id) ?? null,
        }))
        .filter((s) => !data.status || s.status === data.status)
        .filter(
          (s) =>
            !data.q ||
            s.id.toLowerCase().includes(data.q) ||
            s.name.toLowerCase().includes(data.q) ||
            (s.owner_name ?? "").toLowerCase().includes(data.q) ||
            (s.owner_email ?? "").toLowerCase().includes(data.q),
        );
      const pageSize = 25;
      return {
        items: all.slice(data.page * pageSize, data.page * pageSize + pageSize),
        total: all.length,
        pageSize,
      };
    },
  );

/** Remove Pro from exactly one store. Payment history is never touched. */
export const revokeStoreProPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<RevokeInput>) => input)
  .handler(async ({ data, context }) => {
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return revokeStorePro(
      {
        revokeAtomic: async (args) => {
          const { data: res, error } = await supabaseAdmin.rpc("admin_revoke_store_pro", {
            p_store_id: args.storeId,
            p_actor: args.actorId,
            p_actor_email: args.actorEmail,
            p_reason: args.reason,
            p_expected_expires_at: args.expectedExpiresAt as string,
          });
          if (error) throw new Error(error.message);
          return res as { status: string };
        },
      },
      context.claims,
      adminEmails(),
      context.userId,
      data,
    );
  });
