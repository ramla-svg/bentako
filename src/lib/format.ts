export function formatMoney(value: number, currency = "PHP"): string {
  const symbol = currency === "PHP" ? "₱" : "";
  const n = Number.isFinite(value) ? value : 0;
  const formatted = n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${symbol}${formatted}` : `${currency} ${formatted}`;
}

export function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Cash shortcut index; Exact wins over a matching denomination. */
export function selectedQuickCashIndex(cash: string, total: number, hasItems: boolean): number {
  const received = Number(cash);
  if (!cash.trim() || !Number.isFinite(received) || received < 0) return -1;
  const cents = Math.round(received * 100);
  if (hasItems && Number.isFinite(total) && total > 0 && cents === Math.round(total * 100)) {
    return 0;
  }
  const preset = [20, 50, 100, 200, 500, 1000].findIndex((amount) => cents === amount * 100);
  return preset < 0 ? -1 : preset + 1;
}

const dateTimeFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** Local YYYY-MM-DD (not UTC) so "today" matches the store's day. */
export function localDayKey(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
