import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPinOwner, recentGoogleAuthentication } from "./pin-policy";

export const verifyPinOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; ownerId: string; recovery: boolean }) => z.object({ storeId: z.string().uuid(), ownerId: z.string().uuid(), recovery: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const [profile, roles, store] = await Promise.all([
      context.supabase.from("profiles").select("store_id").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("stores").select("owner_id").eq("id", data.storeId).maybeSingle(),
    ]);
    if (profile.error || roles.error || store.error) throw new Error("Owner verification is unavailable. Your PIN and records have not changed.");
    assertPinOwner({
      userId: context.userId, expectedOwnerId: data.ownerId, storeId: data.storeId,
      profileStoreId: profile.data?.store_id ?? null, storeOwnerId: store.data?.owner_id ?? null,
      ownerRole: roles.data?.some((r) => r.role === "owner") ?? false,
      recovery: data.recovery, recentGoogle: recentGoogleAuthentication(context.claims, Date.now() / 1000),
    });
    return { ownerId: context.userId, storeId: data.storeId, verified: true };
  });