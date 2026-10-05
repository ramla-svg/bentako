/**
 * Print abstraction. Android uses a dedicated native WebView print job so the
 * print service never captures the visible app. Browsers use the active-page
 * print path, with a separate-frame fallback.
 */

import { registerPlugin } from "@capacitor/core";
import { isNative, platformOS } from "@/lib/platform/platform-service";

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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Narrow-roll (58mm x 105mm) print stylesheet: pure black on white, grocery
 * slip style, compact enough that a normal basket fits one slip.
 */
const RECEIPT_CSS =
  `@page{size:58mm 105mm;margin:2mm}` +
  `html,body{margin:0!important;padding:0!important;background:#fff!important;width:54mm!important;min-height:0!important}` +
  `body{color:#000!important;font:10.5px/1.25 monospace;width:54mm!important;` +
  `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
  `*{color:#000!important;background:transparent!important;box-shadow:none!important}` +
  `img.logo{display:block;margin:0 auto 2px;max-width:28mm;max-height:12mm;` +
  `filter:grayscale(100%) contrast(140%)}` +
  `.name{text-align:center;font-size:13px;font-weight:700;line-height:1.2;` +
  `font-family:system-ui,sans-serif;text-transform:uppercase}` +
  `.meta{text-align:center;font-size:10px;line-height:1.2}` +
  `hr{border:none;border-top:1px dashed #000;margin:3px 0}` +
  `.info{font-size:10px;line-height:1.3}` +
  `table{width:100%;border-collapse:collapse;table-layout:fixed;font:inherit}` +
  `thead{display:table-header-group}` +
  `tr{page-break-inside:avoid;break-inside:avoid}` +
  `th,td{padding:1px 0;vertical-align:top}` +
  `.items .qty{width:6mm;text-align:right;padding-right:1.5mm}` +
  `.items .nm{width:auto;overflow-wrap:anywhere;word-break:normal}` +
  `.items .amt{width:20mm;text-align:right;white-space:nowrap;padding-left:1mm;font-size:10px}` +
  `.head th{font-size:9.5px;font-weight:700;border-bottom:1px dashed #000}` +
  `.totals{margin-top:2px;border-top:1px dashed #000}` +
  `.totals .label{width:auto;text-align:left}` +
  `.totals .amt{width:24mm;text-align:right;white-space:nowrap;padding-left:1mm}` +
  `.totals .total th,.totals .total td{padding:3px 0 2px;font-size:16px;font-weight:700;line-height:1.15;border-top:1px dashed #000}` +
  `.foot{text-align:center;font-size:10px;line-height:1.25;margin-top:4px;white-space:pre-line}`;

type ReceiptPrinterPlugin = {
  print(options: { html: string; title: string }): Promise<{ started: boolean }>;
};

const NativeReceiptPrinter = registerPlugin<ReceiptPrinterPlugin>("ReceiptPrinter");

export function receiptDocument(bodyHtml: string, title: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=58mm">` +
    `<title>${escapeHtml(title)}</title><style>${RECEIPT_CSS}</style>` +
    `</head><body>${bodyHtml}</body></html>`
  );
}

function printNativeReceipt(bodyHtml: string, title: string): boolean {
  if (!isNative() || platformOS() !== "android") return false;
  void NativeReceiptPrinter.print({ html: receiptDocument(bodyHtml, title), title }).catch(() => {
    printActiveDocument(bodyHtml, title);
  });
  return true;
}

/** Wraps plain text so old callers keep working. */
function textDocument(text: string, title: string): string {
  return receiptDocument(
    `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeHtml(text)}</pre>`,
    title,
  );
}

export type ReceiptPrintRow = {
  left: string;
  right: string;
  strong?: boolean;
  muted?: boolean;
  qty?: string;
};

export type ReceiptPrintDoc = {
  logoUrl?: string | null;
  storeName: string;
  meta: string[];
  /** Left-aligned lines (receipt no., date, cashier) shown under the store block. */
  info?: string[];
  items: ReceiptPrintRow[];
  totals: ReceiptPrintRow[];
  footer?: string | null;
};

export function buildReceiptHtml(doc: ReceiptPrintDoc): string {
  const parts: string[] = [];
  if (doc.logoUrl) parts.push(`<img class="logo" src="${escapeHtml(doc.logoUrl)}" alt="">`);
  parts.push(`<div class="name">${escapeHtml(doc.storeName)}</div>`);
  for (const m of doc.meta) parts.push(`<div class="meta">${escapeHtml(m)}</div>`);
  parts.push("<hr>");
  for (const line of doc.info ?? []) parts.push(`<div class="info">${escapeHtml(line)}</div>`);
  if ((doc.info ?? []).length > 0) parts.push("<hr>");
  parts.push(
    `<table class="items"><thead><tr class="head"><th class="qty" scope="col">QTY</th>` +
      `<th class="nm" scope="col">ITEM</th><th class="amt" scope="col">AMOUNT</th>` +
      `</tr></thead><tbody>`,
  );
  for (const it of doc.items) {
    parts.push(
      `<tr><td class="qty">${escapeHtml(it.qty ?? "")}</td>` +
        `<td class="nm">${escapeHtml(it.left)}</td>` +
        `<td class="amt">${escapeHtml(it.right)}</td></tr>`,
    );
  }
  parts.push('</tbody></table><table class="totals"><tbody>');
  for (const t of doc.totals) {
    const cls = t.strong ? ` class="total"` : "";
    parts.push(
      `<tr${cls}><th class="label" scope="row">${escapeHtml(t.left)}</th>` +
        `<td class="amt">${escapeHtml(t.right)}</td></tr>`,
    );
  }
  parts.push("</tbody></table><hr>");
  if (doc.footer) parts.push(`<div class="foot">${escapeHtml(doc.footer)}</div>`);
  return parts.join("");
}

/**
 * Prints an already-built HTML document. Waits for the frame (and its logo) to
 * load before calling print, and keeps the frame alive until printing finishes —
 * removing it too early is why phones printed nothing.
 */
function printHtml(html: string, title: string): boolean {
  if (printTarget() !== "browser") return false;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", title);
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.border = "0";
  frame.srcdoc = html;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener("afterprint", cleanup);
    window.setTimeout(() => frame.remove(), 500);
  };

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      cleanup();
      openPrintWindow(html);
      return;
    }
    const go = () => {
      try {
        win.focus();
        win.addEventListener("afterprint", cleanup);
        window.addEventListener("afterprint", cleanup);
        win.print();
      } catch {
        cleanup();
        openPrintWindow(html);
        return;
      }
      // Backstop: some WebViews never fire afterprint.
      window.setTimeout(cleanup, 60_000);
    };
    // Give a logo image a moment to decode so it is not missing on paper.
    const imgs = Array.from(win.document.images);
    if (imgs.length === 0 || imgs.every((i) => i.complete)) go();
    else {
      let waited = false;
      const once = () => {
        if (waited) return;
        waited = true;
        go();
      };
      imgs.forEach((i) => {
        i.addEventListener("load", () => {
          if (imgs.every((x) => x.complete)) once();
        });
        i.addEventListener("error", once);
      });
      window.setTimeout(once, 2500);
    }
  };

  document.body.appendChild(frame);
  return true;
}

/**
 * Prints from the active document. Android WebView print services (including
 * the one commonly used with Goojprt printers) may ignore an iframe's print
 * target and capture its parent page. Keeping the receipt in the parent page
 * and hiding every sibling in @media print prevents the app UI being printed.
 */
function printActiveDocument(bodyHtml: string, title: string): boolean {
  if (printTarget() !== "browser" || !document.body || !document.head) return false;

  const oldRoot = document.getElementById("bentako-print-receipt");
  const oldStyle = document.getElementById("bentako-print-style");
  oldRoot?.remove();
  oldStyle?.remove();

  const root = document.createElement("section");
  root.id = "bentako-print-receipt";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = bodyHtml;

  const style = document.createElement("style");
  style.id = "bentako-print-style";
  style.textContent =
    `#bentako-print-receipt{position:fixed;left:-10000px;top:0;width:54mm;` +
    `color:#000;background:#fff;font:10.5px/1.25 ui-monospace,Menlo,Consolas,monospace}` +
    `@media print{` +
    `@page{size:58mm 105mm;margin:2mm}` +
    `html,body{width:54mm!important;min-width:54mm!important;max-width:54mm!important;` +
    `height:auto!important;margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important}` +
    `body>*:not(#bentako-print-receipt){display:none!important}` +
    `#bentako-print-receipt{display:block!important;position:static!important;left:auto!important;top:auto!important;` +
    `width:54mm!important;margin:0!important;padding:0!important;color:#000!important;background:#fff!important;` +
    `font:10.5px/1.25 ui-monospace,Menlo,Consolas,monospace!important;` +
    `-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}` +
    `#bentako-print-receipt *{color:#000!important;background:transparent!important;box-shadow:none!important}` +
    `#bentako-print-receipt img.logo{display:block!important;margin:0 auto 2px!important;max-width:28mm!important;` +
    `max-height:12mm!important;filter:grayscale(100%) contrast(140%)!important}` +
    `#bentako-print-receipt .name{text-align:center;font:700 13px/1.2 system-ui,sans-serif!important;text-transform:uppercase}` +
    `#bentako-print-receipt .meta{text-align:center;font-size:10px;line-height:1.2}` +
    `#bentako-print-receipt hr{border:0!important;border-top:1px dashed #000!important;margin:3px 0!important}` +
    `#bentako-print-receipt .info{font-size:10px;line-height:1.3}` +
    `#bentako-print-receipt table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font:inherit!important}` +
    `#bentako-print-receipt thead{display:table-header-group!important}` +
    `#bentako-print-receipt tr{break-inside:avoid!important}` +
    `#bentako-print-receipt th,#bentako-print-receipt td{padding:1px 0!important;vertical-align:top!important}` +
    `#bentako-print-receipt .items .qty{width:6mm!important;text-align:right!important;padding-right:1.5mm!important}` +
    `#bentako-print-receipt .items .nm{width:auto!important;overflow-wrap:anywhere!important;word-break:normal!important}` +
    `#bentako-print-receipt .items .amt{width:20mm!important;text-align:right!important;white-space:nowrap!important;padding-left:1mm!important;font-size:10px!important}` +
    `#bentako-print-receipt .head th{font-size:9.5px!important;font-weight:700!important;border-bottom:1px dashed #000!important}` +
    `#bentako-print-receipt .totals{margin-top:2px!important;border-top:1px dashed #000!important}` +
    `#bentako-print-receipt .totals .label{width:auto!important;text-align:left!important}` +
    `#bentako-print-receipt .totals .amt{width:24mm!important;text-align:right!important;white-space:nowrap!important;padding-left:1mm!important}` +
    `#bentako-print-receipt .totals .total th,#bentako-print-receipt .totals .total td{padding:3px 0 2px!important;font-size:16px!important;font-weight:700!important;line-height:1.15!important;border-top:1px dashed #000!important}` +
    `#bentako-print-receipt .foot{text-align:center;font-size:10px;line-height:1.25;margin-top:4px;white-space:pre-line}` +
    `}`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("afterprint", afterPrint);
    window.setTimeout(() => {
      root.remove();
      style.remove();
    }, 1500);
  };
  const afterPrint = () => cleanup();
  window.addEventListener("afterprint", afterPrint);

  const printNow = () => {
    try {
      const previousTitle = document.title;
      document.title = title;
      window.focus();
      window.print();
      document.title = previousTitle;
      window.setTimeout(cleanup, 60_000);
    } catch {
      cleanup();
      printHtml(receiptDocument(bodyHtml, title), title);
    }
  };

  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0 || images.every((image) => image.complete)) {
    window.setTimeout(printNow, 50);
  } else {
    let started = false;
    const once = () => {
      if (started) return;
      started = true;
      printNow();
    };
    const check = () => {
      if (images.every((image) => image.complete)) once();
    };
    images.forEach((image) => {
      image.addEventListener("load", check, { once: true });
      image.addEventListener("error", check, { once: true });
    });
    window.setTimeout(once, 2500);
  }
  return true;
}

/** Last resort when the hidden frame is blocked: a real window the user can print. */
function openPrintWindow(html: string): boolean {
  try {
    const win = window.open("", "_blank");
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    window.setTimeout(() => {
      try {
        win.print();
      } catch {
        /* the user can still print from the browser menu */
      }
    }, 400);
    return true;
  } catch {
    return false;
  }
}

/** Prints a structured receipt (store logo, items, big total). */
export function printReceipt(doc: ReceiptPrintDoc, title = "Receipt"): boolean {
  const html = buildReceiptHtml(doc);
  return printNativeReceipt(html, title) || printActiveDocument(html, title);
}

/** Prints a monospaced plain-text receipt. */
export function printReceiptText(text: string, title = "Receipt"): boolean {
  const html = `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeHtml(text)}</pre>`;
  return printNativeReceipt(html, title) || printActiveDocument(html, title);
}
