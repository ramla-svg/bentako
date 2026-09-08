/**
 * "Pay with GCash" sheet: shows where to send the money, then records the
 * GCash reference number so the BentaKo owner can confirm it.
 */
import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/hooks/use-app-session";
import { getBillingConfig, type BillingConfig } from "@/lib/billing.functions";
import {
  fetchLatestPayment,
  priceFor,
  referenceCodeFor,
  submitPlanPayment,
  type PlanPaymentRow,
} from "@/lib/billing-client";
import { formatMoney } from "@/lib/format";
import type { PlanPeriod } from "@/lib/plan";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: PlanPeriod;
}

export function GcashPaySheet({ open, onOpenChange, period }: Props) {
  const { store, userId, email, refresh } = useAppSession();
  const loadConfig = useServerFn(getBillingConfig);

  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [latest, setLatest] = useState<PlanPaymentRow | null>(null);
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = priceFor(period);
  const code = referenceCodeFor(store?.id);
  const waiting = latest?.status === "pending";

  useEffect(() => {
    if (!open || !store?.id) return;
    void loadConfig().then(setConfig).catch(() => setConfig(null));
    void fetchLatestPayment(store.id).then(setLatest).catch(() => setLatest(null));
  }, [open, store?.id, loadConfig]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy. Please type it instead.");
    }
  };

  const submit = async () => {
    if (!store?.id) return;
    if (reference.trim().length < 6) {
      toast.error("Type the GCash reference number from your receipt.");
      return;
    }
    setBusy(true);
    try {
      const row = await submitPlanPayment({
        storeId: store.id,
        storeName: store.name,
        userId,
        email,
        period,
        amount,
        gcashReference: reference,
        proof,
      });
      setLatest(row);
      setReference("");
      setProof(null);
      toast.success("Sent. We will confirm your payment shortly.");
      void refresh();
    } catch {
      toast.error("Could not send it. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Pay with GCash</DialogTitle>
          <DialogDescription>
            BentaKo Pro — {period === "yearly" ? "Yearly" : "Monthly"} ·{" "}
            <span className="tnum font-semibold text-foreground">
              {formatMoney(amount, store?.currency ?? "PHP")}
            </span>
          </DialogDescription>
        </DialogHeader>

        {waiting ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-primary" /> Waiting for confirmation
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                We are checking GCash reference {latest?.gcash_reference}. This is usually done
                within the day. Keep selling — nothing stops while you wait.
              </p>
            </div>
            <Button className="h-12 w-full" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {latest?.status === "rejected" ? (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Your last payment could not be confirmed
                {latest.review_note ? `: ${latest.review_note}` : ""}. Please check the reference
                number and send it again.
              </p>
            ) : null}

            {config?.gcashQrUrl ? (
              <img
                src={config.gcashQrUrl}
                alt="GCash QR code for paying BentaKo Pro"
                className="mx-auto size-44 rounded-2xl border bg-card object-contain p-2"
                loading="lazy"
              />
            ) : null}

            <dl className="space-y-2 rounded-2xl border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">GCash name</dt>
                <dd className="font-medium">{config?.gcashName || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">GCash number</dt>
                <dd className="flex items-center gap-1">
                  <span className="tnum font-medium">{config?.gcashNumber || "—"}</span>
                  {config?.gcashNumber ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void copy(config.gcashNumber, "Number")}
                    >
                      <Copy className="size-4" />
                    </Button>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Put this in the notes</dt>
                <dd className="flex items-center gap-1">
                  <span className="font-semibold">{code}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => void copy(code, "Reference")}
                  >
                    <Copy className="size-4" />
                  </Button>
                </dd>
              </div>
            </dl>

            {!config?.gcashNumber ? (
              <p className="text-xs text-muted-foreground">
                The GCash details are not set yet. Please try again in a moment.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="gcash-ref">GCash reference number</Label>
              <Input
                id="gcash-ref"
                inputMode="numeric"
                placeholder="e.g. 1234567890123"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="h-12"
              />
              <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm text-muted-foreground">
                <Paperclip className="size-4" />
                {proof ? proof.name : "Attach screenshot (optional)"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <Button className="h-14 w-full text-base" disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} I have paid
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Confirmed within the day. Your sales, products and utang keep working meanwhile.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
