/**
 * Central platform detection. Components and services must ask this module
 * instead of sniffing `navigator` / `window` themselves, so a future Capacitor
 * Android build only needs changes here.
 */

export type PlatformKind = "web" | "pwa" | "capacitor";
export type PlatformOS = "android" | "ios" | "other";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** True when running inside a Capacitor native WebView (Android/iOS shell). */
export function isNative(): boolean {
  if (!hasWindow()) return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" ? cap.isNativePlatform() : false;
}

/** True when launched from a home-screen icon (installed PWA / standalone). */
export function isStandalone(): boolean {
  if (!hasWindow()) return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches === true ||
    iosStandalone === true
  );
}

export function platformKind(): PlatformKind {
  if (isNative()) return "capacitor";
  if (isStandalone()) return "pwa";
  return "web";
}

export function platformOS(): PlatformOS {
  if (!hasWindow()) return "other";
  const ua = window.navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

export function platformLabel(): string {
  const kind = platformKind();
  const os = platformOS();
  if (kind === "capacitor") return os === "android" ? "Android app" : "Mobile app";
  if (kind === "pwa") return "Installed app";
  return "Browser";
}

/** Service workers are a web-only concern; native shells ship their own assets. */
export function supportsServiceWorker(): boolean {
  return hasWindow() && "serviceWorker" in navigator && !isNative();
}
