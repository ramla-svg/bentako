import { db, getSetting, setSetting } from "./local-db";
import { pinFailure, validPin } from "./pin-policy";

export interface PinRecord {
  version: 1;
  storeId: string;
  ownerId: string;
  salt: string;
  hash: string;
  failures: number;
  blockedUntil: number;
}

const key = (storeId: string) => `offline_pin:${storeId}`;
const hex = (bytes: Uint8Array) => Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
const bytes = (value: string) => Uint8Array.from(value.match(/.{2}/g) ?? [], (n) => parseInt(n, 16));

export async function readPin(storeId: string): Promise<PinRecord | null> {
  const record = await getSetting<PinRecord | null>(key(storeId), null);
  if (record && (record.version !== 1 || record.storeId !== storeId || !/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash))) throw new Error("The saved PIN could not be read. Use owner recovery; do not clear this device's data.");
  return record;
}

async function digest(pin: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({name:"PBKDF2",salt:bytes(salt),iterations:210_000,hash:"SHA-256"},material,256);
  return hex(new Uint8Array(result));
}

let verification: Promise<{ ok: boolean; blockedUntil: number }> | null = null;

/** Serialize guesses so parallel clicks cannot evade persisted retry limits. */
export async function verifyOfflinePin(storeId: string, pin: string): Promise<{ok:boolean;blockedUntil:number}> {
  const earlier = verification;
  const run = (async () => {
    if (earlier) await earlier;
    const record = await readPin(storeId);
    if (!record) throw new Error("No PIN is set on this device.");
    if (record.blockedUntil > Date.now()) return {ok:false,blockedUntil:record.blockedUntil};
    if (!validPin(pin)) return {ok:false,blockedUntil:record.blockedUntil};
    const hash = await digest(pin, record.salt);
    let difference = 0;
    for (let i=0;i<hash.length;i++) difference |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
    const next = difference === 0 ? {failures:0,blockedUntil:0} : pinFailure(record.failures,Date.now());
    await setSetting(key(storeId),{...record,...next});
    return {ok:difference===0,blockedUntil:next.blockedUntil};
  })();
  verification = run;
  try {return await run;} finally {if(verification===run) verification=null;}
}

export async function saveOfflinePin(storeId: string, ownerId: string, pin: string, currentPin?: string): Promise<void> {
  if (!validPin(pin)) throw new Error("Enter exactly 4 digits.");
  const existing = await readPin(storeId);
  if (existing && (existing.ownerId !== ownerId || !(await verifyOfflinePin(storeId,currentPin ?? "")).ok)) throw new Error("The current PIN was not accepted. Wait if locked, then try again.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await setSetting(key(storeId),{version:1,storeId,ownerId,salt,hash:await digest(pin,salt),failures:0,blockedUntil:0} satisfies PinRecord);
}

export async function disableOfflinePin(storeId: string, ownerId: string, currentPin: string): Promise<void> {
  const existing = await readPin(storeId);
  if (!existing || existing.ownerId !== ownerId || !(await verifyOfflinePin(storeId,currentPin)).ok) throw new Error("The current PIN was not accepted.");
  await db().settings.delete(key(storeId));
}

/** Caller must obtain fresh server-verified owner recovery before invoking. */
export async function recoverOfflinePin(storeId: string, ownerId: string): Promise<void> {
  const record = await readPin(storeId);
  if (!record || record.ownerId !== ownerId) throw new Error("This PIN belongs to a different owner.");
  await db().settings.delete(key(storeId));
}