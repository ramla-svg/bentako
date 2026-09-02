/**
 * Print abstraction. Today: browser printing of a plain-text receipt in a
 * hidden iframe (works in a PWA and in a WebView print bridge). Later a
 * Bluetooth 58mm/80mm thermal driver can implement the same interface without
 * changing receipt business logic.
 */

export type PrintTarget = "browser" | "unavailable";

export function printTarget(): PrintTarget {
  return typeof window !== "undefined" && typeof window.print === "function"
    ? "browser"
    : "unavailable";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Prints a monospaced receipt sized for a narrow (58mm-like) roll. */
export function printReceiptText(text: string, title = "Receipt"): boolean {
  if (printTarget() !== "browser") return false;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${escapeHtml(title)}</title>` +
      `<style>@page{margin:6mm}body{font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;` +
      `white-space:pre-wrap;width:58mm;margin:0}</style></head><body>${escapeHtml(text)}</body></html>`,
  );
  doc.close();

  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    cleanup();
  }
  return true;
}
