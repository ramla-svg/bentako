import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/integrations/supabase/client";
import { PIN_LENGTH, clearPin, hasPin, isValidPin, setPin, verifyPin } from "@/lib/offline-pin";
import { isOnline } from "@/lib/sync-service";

export function PinSettings() {
  const { userId, store } = useAppSession();
  const storeId = store?.id;
  const [enabled, setEnabled] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (userId && storeId) void hasPin(userId, storeId).then(setEnabled);
  }, [userId, storeId]);

  if (!userId || !storeId) return null;

  const checkCurrent = async () => {
    const res = await verifyPin(userId, storeId, current);
    if (!res.ok) toast.error(res.waitMs ? "Too many wrong tries. Wait and try again." : "Current PIN is wrong.");
    return res.ok;
  };

  const save = async () => {
    if (!isValidPin(next) || next !== confirm) {
      toast.error(`Enter the same ${PIN_LENGTH}-digit PIN twice.`);
      return;
    }
    setBusy(true);
    try {
      if (enabled) {
        if (!(await checkCurrent())) return;
      } else {
        // First setup needs a live Google sign-in on this phone.
        const { data } = await supabase.auth.getSession();
        if (!isOnline() || data.session?.user.id !== userId) {
          toast.error("Connect to the internet and stay signed in to set a PIN.");
          return;
        }
      }
      await setPin(userId, storeId, next);
      setEnabled(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("PIN saved on this phone.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      if (!(await checkCurrent())) return;
      await clearPin(userId, storeId);
      setEnabled(false);
      setCurrent("");
      toast.success("PIN turned off.");
    } finally {
      setBusy(false);
    }
  };

  const pinInput = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );

  return (
    <section className="space-y-3 fin-card p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold">
        <KeyRound className="size-4" /> Offline PIN lock
      </h2>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "BentaKo asks for this PIN when opened, even without internet. Stored on this phone only."
          : `Set a ${PIN_LENGTH}-digit PIN to lock BentaKo on this phone. Works offline.`}
      </p>
      {enabled && pinInput("pin-current", "Current PIN", current, setCurrent)}
      {pinInput("pin-new", enabled ? "New PIN" : "PIN", next, setNext)}
      {pinInput("pin-confirm", "Repeat PIN", confirm, setConfirm)}
      <Button className="h-12 w-full" disabled={busy} onClick={() => void save()}>
        {enabled ? "Change PIN" : "Turn on PIN"}
      </Button>
      {enabled && (
        <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={() => void turnOff()}>
          Turn off PIN
        </Button>
      )}
    </section>
  );
}
