import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, PackagePlus, Store } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/sync-service";
import { ensureDefaultCategories, seedDemoProducts } from "@/lib/repo";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up your store — SariPOS" },
      { name: "description", content: "Name your sari-sari store and start selling in minutes." },
      { property: "og:title", content: "Set up your store — SariPOS" },
      { property: "og:description", content: "Two quick steps and your POS is ready." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { status, userId, userName, refresh } = useAppSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState(userName ?? "");
  const [footer, setFooter] = useState("Salamat po! Come again.");
  const [withDemo, setWithDemo] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
    if (status === "ready") void navigate({ to: "/dashboard", replace: true });
  }, [status, navigate]);

  async function finish() {
    if (!storeName.trim()) {
      toast.error("Please enter your store name.");
      setStep(1);
      return;
    }
    if (!isOnline()) {
      toast.error("You need internet just for this first setup. Please connect and try again.");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? userId;
      if (!uid) throw new Error("Please sign in again.");

      const { data: store, error: storeError } = await supabase
        .from("stores")
        .insert({
          name: storeName.trim(),
          owner_id: uid,
          owner_name: ownerName.trim() || null,
          receipt_footer: footer.trim() || null,
        })
        .select("id")
        .single();
      if (storeError) throw storeError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ store_id: store.id, full_name: ownerName.trim() || null })
        .eq("id", uid);
      if (profileError) throw profileError;

      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({ user_id: uid, role: "owner", store_id: store.id }, { onConflict: "user_id,role" });
      if (roleError) throw roleError;

      const ctx = { storeId: store.id, userId: uid, userName: ownerName.trim() || null };
      await ensureDefaultCategories(store.id);
      if (withDemo) await seedDemoProducts(ctx);

      await refresh();
      toast.success("Your store is ready. Happy selling!");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-5 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center gap-2">
          {[1, 2].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>

        {step === 1 ? (
          <div className="mt-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Store className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold">Name your store</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This appears on your receipts and reports.
            </p>

            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="storeName">Store name</Label>
                <Input
                  id="storeName"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Nena's Sari-Sari Store"
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerName">Owner name</Label>
                <Input
                  id="ownerName"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Aling Nena"
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="footer">Receipt footer</Label>
                <Textarea
                  id="footer"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  rows={2}
                />
              </div>
              <Button
                className="h-12 w-full text-base"
                onClick={() => setStep(2)}
                disabled={!storeName.trim()}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-accent/20 text-accent-foreground">
              <PackagePlus className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold">Starter products</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We can add common sari-sari items so you can try the POS right away. You can edit or
              delete them anytime.
            </p>

            <div className="mt-6 flex items-center justify-between rounded-2xl border bg-card p-4">
              <div className="min-w-0 pr-3">
                <p className="font-medium">Add sample products</p>
                <p className="text-xs text-muted-foreground">
                  Coke Mismo, Pancit Canton, Nescafé, and more.
                </p>
              </div>
              <Switch checked={withDemo} onCheckedChange={setWithDemo} />
            </div>

            <div className="mt-6 space-y-2">
              <Button className="h-12 w-full text-base" onClick={() => void finish()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Finish setup
              </Button>
              <Button variant="ghost" className="h-11 w-full" onClick={() => setStep(1)}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
