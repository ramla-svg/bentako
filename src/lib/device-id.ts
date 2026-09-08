/**
 * A small, private id for this phone. It never leaves the shop's own records
 * and is only used to count how many phones a shop uses on its plan.
 */
const KEY = "bk_device_id";

export function deviceId(): string {
  if (typeof window === "undefined") return "server";
  let value = window.localStorage.getItem(KEY);
  if (!value) {
    value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(KEY, value);
  }
  return value;
}

/** Friendly name so the owner can tell their phones apart. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Phone";
  const ua = navigator.userAgent;
  const platform =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android phone"
    : /Windows/.test(ua) ? "Windows PC"
    : /Mac OS X/.test(ua) ? "Mac"
    : "Device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";
  return `${platform} · ${browser}`;
}
