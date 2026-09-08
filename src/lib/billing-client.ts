/**
 * Client side of the manual GCash upgrade flow.
 *
 * Rows go straight into plan_payments under RLS (a store may only see and add
 * its own). Approving them is server-only — see billing.functions.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { PRO_PRICE_MONTHLY, PRO_PRICE_YEARLY, type PlanPeriod } from "@/lib/plan";

export interface PlanPaymentRow {
  id: string;
  plan_period: string;
  amount: number;
  reference_code: string;
  gcash_reference: string;
  status: string;
  review_note: string | null;
  created_at: string;
}

/** Short code the owner writes in the GCash notes, e.g. BK-4F21. */
export function referenceCodeFor(storeId: string | null | undefined): string {
  if (!storeId) return "BK-0000";
  return `BK-${storeId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}`;
}

export function priceFor(period: PlanPeriod): number {
  return period === "yearly" ? PRO_PRICE_YEARLY : PRO_PRICE_MONTHLY;
}

export async function fetchLatestPayment(storeId: string): Promise<PlanPaymentRow | null> {
  const { data } = await supabase
    .from("plan_payments")
    .select("id, plan_period, amount, reference_code, gcash_reference, status, review_note, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? ({ ...data, amount: Number(data.amount) } as PlanPaymentRow) : null;
}

export interface SubmitPaymentInput {
  storeId: string;
  storeName: string | null;
  userId: string | null;
  email: string | null;
  period: PlanPeriod;
  amount: number;
  gcashReference: string;
  proof?: File | null;
}

export async function submitPlanPayment(input: SubmitPaymentInput): Promise<PlanPaymentRow> {
  let proofPath: string | null = null;

  // The screenshot is only uploaded when the owner chooses to attach it here;
  // receipt photos taken while selling still never leave the phone.
  if (input.proof) {
    const ext = input.proof.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${input.storeId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("payment-proofs")
      .upload(path, input.proof, { upsert: false, contentType: input.proof.type || "image/jpeg" });

    if (!error) proofPath = path;
  }

  const { data, error } = await supabase
    .from("plan_payments")
    .insert({
      store_id: input.storeId,
      store_name: input.storeName,
      requested_by: input.userId,
      requested_by_email: input.email,
      plan_period: input.period,
      amount: input.amount,
      reference_code: referenceCodeFor(input.storeId),
      gcash_reference: input.gcashReference.trim(),
      proof_path: proofPath,
    })
    .select(
      "id, plan_period, amount, reference_code, gcash_reference, status, review_note, created_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return { ...data, amount: Number(data.amount) } as PlanPaymentRow;
}
