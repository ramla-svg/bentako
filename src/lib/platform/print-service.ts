/**
 * Print abstraction. Today: browser printing of a receipt in a hidden iframe
 * (works in a PWA and in a WebView print bridge), with a new-window fallback.
 * Later a Bluetooth 58mm/80mm thermal driver can implement the same interface
 * without changing receipt business logic.
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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Narrow-roll (58mm x 105mm) print stylesheet: pure black on white, grocery
 * slip style, compact enough that a normal basket fits one slip.
 */
function receiptDocument(bodyHtml: string, title: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=58mm">` +
    `<title>${escapeHtml(title)}</title>` +
    `<style>` +
    `@page{size:58mm 105mm;margin:2mm}` +
    `html,body{margin:0;padding:0;background:#fff}` +
    `body{color:#000;font:11px/1.25 ui-monospace,Menlo,Consolas,monospace;width:54mm;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `*{color:#000!important;background:transparent!important;box-shadow:none!important}` +
    `img.logo{display:block;margin:0 auto 2px;max-width:28mm;max-height:12mm;` +
    `filter:grayscale(100%) contrast(140%)}` +
    `.name{text-align:center;font-size:13px;font-weight:700;line-height:1.2;` +
    `font-family:system-ui,sans-serif;text-transform:uppercase}` +
    `.meta{text-align:center;font-size:10px;line-height:1.2}` +
    `hr{border:none;border-top:1px dashed #000;margin:3px 0}` +
    `.head{display:flex;justify-content:space-between;font-size:10px;font-weight:700;` +
    `letter-spacing:.02em}` +
    `.row{display:flex;justify-content:space-between;gap:4px;font-size:11px;` +
    `page-break-inside:avoid;break-inside:avoid}` +
    `.row span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
    `.row span:last-child{white-space:nowrap}` +
    `.total{font-size:16px;font-weight:700;line-height:1.3}` +
    `.foot{text-align:center;font-size:10px;line-height:1.25;margin-top:4px;` +
    `white-space:pre-line}` +
    `</style></head><body>${bodyHtml}</body></html>`
  );
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
  items: ReceiptPrintRow[];
  totals: ReceiptPrintRow[];
  footer?: string | null;
};

function buildReceiptHtml(doc: ReceiptPrintDoc): string {
  const parts: string[] = [];
  if (doc.logoUrl) parts.push(`<img class="logo" src="${escapeHtml(doc.logoUrl)}" alt="">`);
  parts.push(`<div class="name">${escapeHtml(doc.storeName)}</div>`);
  for (const m of doc.meta) parts.push(`<div class="meta">${escapeHtml(m)}</div>`);
  parts.push("<hr>");
  for (const line of doc.info ?? []) parts.push(`<div class="info">${escapeHtml(line)}</div>`);
  if ((doc.info ?? []).length > 0) parts.push("<hr>");
  parts.push(
    `<div class="row head"><span class="qty">QTY</span><span class="nm">ITEM</span>` +
      `<span class="amt">AMOUNT</span></div>`,
  );
  for (const it of doc.items) {
    parts.push(
      `<div class="row"><span class="qty">${escapeHtml(it.qty ?? "")}</span>` +
        `<span class="nm">${escapeHtml(it.left)}</span>` +
        `<span class="amt">${escapeHtml(it.right)}</span></div>`,
    );
  }
  parts.push("<hr>");
  for (const t of doc.totals) {
    if (t.strong) parts.push("<hr>");
    const cls = `row${t.strong ? " total" : ""}`;
    parts.push(
      `<div class="${cls}"><span class="nm">${escapeHtml(t.left)}</span>` +
        `<span class="amt">${escapeHtml(t.right)}</span></div>`,
    );
  }
  parts.push("<hr>");
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
  return printHtml(receiptDocument(buildReceiptHtml(doc), title), title);
}

/** Prints a monospaced plain-text receipt. */
export function printReceiptText(text: string, title = "Receipt"): boolean {
  return printHtml(textDocument(text, title), title);
}
