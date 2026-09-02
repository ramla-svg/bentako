import { isNative } from "./platform-service";

/**
 * Share abstraction. Web Share API where available, clipboard fallback
 * otherwise. A Capacitor Share plugin can be added inside `shareText` later
 * without touching receipt logic.
 */

export type ShareResult = "shared" | "copied" | "unavailable";

export function canShare(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function" || !!navigator.clipboard || isNative();
}

export async function shareText(options: {
  title?: string;
  text: string;
}): Promise<ShareResult> {
  if (typeof navigator === "undefined") return "unavailable";

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        ...(options.title ? { title: options.title } : {}),
        text: options.text,
      });
      return "shared";
    } catch (err) {
      // User cancelled — treat as handled, do not fall back noisily.
      if (err instanceof Error && err.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard?.writeText(options.text);
    return "copied";
  } catch {
    return "unavailable";
  }
}
