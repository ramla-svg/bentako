export const PIN_LENGTH = 4;
export const PIN_ATTEMPT_LIMIT = 5;

export function validPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function pinFailure(failures: number, now: number) {
  const next = failures + 1;
  return {
    failures: next,
    blockedUntil: next >= PIN_ATTEMPT_LIMIT
      ? now + Math.min(300_000, 30_000 * 2 ** Math.min(next - PIN_ATTEMPT_LIMIT, 4))
      : 0,
  };
}

/** Use authentication-method time, never token iat (refresh changes iat). */
export function recentGoogleAuthentication(claims: { amr?: unknown; app_metadata?: unknown }, now: number): boolean {
  if (!Array.isArray(claims.amr) || !claims.app_metadata || typeof claims.app_metadata !== "object") return false;
  const metadata = claims.app_metadata as { providers?: unknown; provider?: unknown };
  const google = metadata.provider === "google" || (Array.isArray(metadata.providers) && metadata.providers.includes("google"));
  return google && claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as { method?: unknown; timestamp?: unknown };
    return item.method === "oauth" && typeof item.timestamp === "number" && item.timestamp <= now + 30 && now - item.timestamp <= 300;
  });
}

export function assertPinOwner(input: { userId: string; expectedOwnerId: string; storeId: string; profileStoreId: string | null; storeOwnerId: string | null; ownerRole: boolean; recovery: boolean; recentGoogle: boolean }) {
  if (input.userId !== input.expectedOwnerId || input.storeId !== input.profileStoreId || input.userId !== input.storeOwnerId || !input.ownerRole) throw new Error("Only this shop's owner can manage its PIN.");
  if (input.recovery && !input.recentGoogle) throw new Error("Sign in with the owner's Google account again to reset the PIN.");
}