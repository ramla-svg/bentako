import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Delete, Lock } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { getSetting, setSetting } from "@/lib/local-db";
import { PIN_LENGTH, clearPin, hasPin, verifyPin } from "@/lib/offline-pin";
import { isOnline } from "@/lib/sync-service";

const IDLE_MS = 3 * 60_000;
const RESET_KEY = "pin_reset_requested_at";

/** Locks the store behind the device PIN on open and after time in background. */
export function PinGate({ children }: { children: ReactNode }) {
  const { userId, store } = useAppSession();
  const storeId = store?.id ?? null;
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId || !storeId) return;
    let alive = true;
    void (async () => {
      const exists = await hasPin(userId, storeId);
      // Forgot PIN: returning from a fresh Google sign-in clears the old PIN.
      const requested = await getSetting<number | null>(RESET_KEY, null);
      if (exists && requested) {
        const { data } = await supabase.auth.getSession();
        const last = data.session?.user.last_sign_in_at;
        if (last && new Date(last).getTime() >= requested - 5_000) {
          await clearPin(userId, storeId);
          await setSetting(RESET_KEY, null);
          if (alive) setLocked(false);
          return;
        }
      }
      if (alive) setLocked(exists);
    })();
    return () => {
      alive = false;
    };
  }, [userId, storeId]);

  useEffect(() => {
    if (!userId || !storeId) return;
    let hiddenAt = 0;
    const onVis = async () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > IDLE_MS && (await hasPin(userId, storeId)))
        setLocked(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId, storeId]);

  if (locked === null) return null;
  if (locked && userId && storeId)
    return <PinPad userId={userId} storeId={storeId} onUnlock={() => setLocked(false)} />;
  return <>{children}</>;
}

function PinPad({
  userId,
  storeId,
  onUnlock,
}: {
  userId: string;
  storeId: string;
  onUnlock: () => void;
}) {
  const [pin, setPinValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      const res = await verifyPin(userId, storeId, value);
      setBusy(false);
      setPinValue("");
      if (res.ok) return onUnlock();
      if (res.waitMs > 0)
        setMessage(`Too many wrong tries. Wait ${Math.ceil(res.waitMs / 1000)} seconds.`);
      else setMessage(`Wrong PIN. ${res.left} tr${res.left === 1 ? "y" : "ies"} left.`);
    },
    [userId, storeId, onUnlock],
  );

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPinValue(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const forgot = async () => {
    if (!isOnline()) {
      setMessage("Connect to the internet to reset your PIN with Google.");
      return;
    }
    await setSetting(RESET_KEY, Date.now());
    await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });
  };

  return (
    <div className="app-gutter flex min-h-screen flex-col items-center justify-center gap-6 bg-background py-10">
      <BrandMark className="size-14" />
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 font-display text-xl font-bold">
          <Lock className="size-5" /> Enter PIN
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Works even without internet.</p>
      </div>
      <div className="flex gap-3" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full border-2 border-primary ${i < pin.length ? "bg-primary" : ""}`}
          />
        ))}
      </div>
      <p className="min-h-5 text-center text-sm font-medium text-destructive" role="alert">
        {message}
      </p>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button key={d} variant="outline" className="h-16 text-2xl" onClick={() => press(d)}>
            {d}
          </Button>
        ))}
        <span />
        <Button variant="outline" className="h-16 text-2xl" onClick={() => press("0")}>
          0
        </Button>
        <Button
          variant="ghost"
          className="h-16"
          aria-label="Delete digit"
          onClick={() => setPinValue((p) => p.slice(0, -1))}
        >
          <Delete className="size-6" />
        </Button>
      </div>
      <div className="text-center text-sm text-muted-foreground">
        <p>Forgot PIN? Ask the store owner.</p>
        <Button variant="link" className="h-auto p-1 text-xs" onClick={() => void forgot()}>
          Or reset with Google (needs internet)
        </Button>
      </div>
    </div>
  );
}
