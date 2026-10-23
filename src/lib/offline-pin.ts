/**
 * Device-only offline PIN. Stored salted + PBKDF2-hashed in the local settings
 * table, scoped to one account and store. Never uploaded.
 */
import { db, getSetting, setSetting } from "./local-db";

export const PIN_LENGTH = 4;
export const FREE_ATTEMPTS = 5;
const ITERATIONS = 150_000;

export interface PinRecord {
  salt: string;
  hash: string;
  failures: number;
  lockedUntil: number;
}

export const pinKey = (userId: string, storeId: string) => `pin:${userId}:${storeId}`;

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toB64(bits);
}

/** Wait after the 5th wrong try: 30s, doubling, capped at 15 minutes. */
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (failures - FREE_ATTEMPTS));
}

export async function getPin(userId: string, storeId: string): Promise<PinRecord | null> {
  return getSetting<PinRecord | null>(pinKey(userId, storeId), null);
}

export async function hasPin(userId: string, storeId: string): Promise<boolean> {
  return !!(await getPin(userId, storeId));
}

export async function setPin(userId: string, storeId: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const record: PinRecord = { salt: toB64(salt), hash: await derive(pin, salt), failures: 0, lockedUntil: 0 };
  await setSetting(pinKey(userId, storeId), record);
}

export async function clearPin(userId: string, storeId: string): Promise<void> {
  await db().settings.delete(pinKey(userId, storeId));
}

/** Remove every PIN on this device (used on sign-out). */
export async function clearAllPins(): Promise<void> {
  const keys = (await db().settings.toCollection().primaryKeys()) as string[];
  await db().settings.bulkDelete(keys.filter((k) => String(k).startsWith("pin:")));
}

export type VerifyResult = { ok: true } | { ok: false; waitMs: number; left: number };

let chain: Promise<unknown> = Promise.resolve();

/** Serialized so rapid taps cannot bypass the attempt counter. */
export function verifyPin(
  userId: string,
  storeId: string,
  pin: string,
  now = Date.now(),
): Promise<VerifyResult> {
  const run = chain.then(async (): Promise<VerifyResult> => {
    const rec = await getPin(userId, storeId);
    if (!rec) return { ok: true };
    if (rec.lockedUntil > now) return { ok: false, waitMs: rec.lockedUntil - now, left: 0 };
    const match = (await derive(pin, fromB64(rec.salt))) === rec.hash;
    if (match) {
      await setSetting(pinKey(userId, storeId), { ...rec, failures: 0, lockedUntil: 0 });
      return { ok: true };
    }
    const failures = rec.failures + 1;
    const wait = lockoutMs(failures);
    await setSetting(pinKey(userId, storeId), {
      ...rec,
      failures,
      lockedUntil: wait ? now + wait : 0,
    });
    return { ok: false, waitMs: wait, left: Math.max(0, FREE_ATTEMPTS - failures) };
  });
  chain = run.catch(() => undefined);
  return run;
}
