/**
 * True only when BentaKo runs inside the Android app shell (Capacitor).
 *
 * Google Play requires that anything sold inside a Play-distributed app goes
 * through Play Billing, so the Android build never shows a way to pay. It only
 * reads the plan the account already has. Buying Pro stays on the website/PWA.
 *
 * The value is resolved after mount so server-rendered and hydrated markup match.
 */
import { useEffect, useState } from "react";

import { isNative } from "@/lib/platform/platform-service";

export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNative());
  }, []);
  return native;
}
