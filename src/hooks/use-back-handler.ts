import { useEffect } from "react";

/**
 * Android back-button readiness.
 *
 * Screens register a handler while a modal / bottom sheet is open. The most
 * recently registered handler runs first; returning `true` means "handled,
 * stop here". Nothing is hijacked in the browser: a future Capacitor wrapper
 * calls `runBackHandlers()` from the native `backButton` event and decides
 * whether to navigate back or exit when no handler consumed the press.
 */

type BackHandler = () => boolean;

const stack: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Returns true when a registered handler consumed the back press. */
export function runBackHandlers(): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const handler = stack[i];
    try {
      if (handler?.()) return true;
    } catch {
      /* ignore a faulty handler and keep walking the stack */
    }
  }
  return false;
}

export function hasBackHandlers(): boolean {
  return stack.length > 0;
}

/** Registers `onBack` while `active` is true (e.g. a sheet or dialog is open). */
export function useBackHandler(active: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => {
      onBack();
      return true;
    });
  }, [active, onBack]);
}
