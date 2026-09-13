/** Formatting used across the console, so one number never renders two ways. */

export function money(amount: number | string | null | undefined, currency = "USD"): string {
  const n = Number(amount ?? 0);
  const symbol = currency === "USD" ? "$" : currency;
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;
}

/** Compact form for KPI cards, where "248 540 $" is wider than the card. */
export function moneyShort(amount: number | string | null | undefined, currency = "USD"): string {
  const n = Number(amount ?? 0);
  const symbol = currency === "USD" ? "$" : currency;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M ${symbol}`;
  if (abs >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k ${symbol}`;
  return money(n, currency);
}

export function count(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString("fr-FR");
}

export function percent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits).replace(".", ",")} %`;
}

/**
 * Change against the previous period. Returns null when there is no baseline,
 * because "+100 %" against zero says nothing an operator can act on.
 */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/** A date-only column parsed as local, never UTC midnight. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const DAY_SHORT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const STAMP = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function day(value: string | null | undefined): string {
  const d = parseDay(value);
  return d ? DAY.format(d) : "—";
}

export function dayShort(value: string | null | undefined): string {
  const d = parseDay(value);
  return d ? DAY_SHORT.format(d) : "—";
}

export function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : STAMP.format(d);
}

/** "il y a 4 min" — the right granularity for an activity feed. */
export function ago(value: string | null | undefined): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "à l'instant";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return day(value);
}

export function range(start: string | null | undefined, end: string | null | undefined): string {
  const a = parseDay(start);
  const b = parseDay(end);
  if (!a) return "—";
  if (!b || a.getTime() === b.getTime()) return DAY.format(a);
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${sameYear ? DAY_SHORT.format(a) : DAY.format(a)} – ${DAY.format(b)}`;
}

/** Plural agreement, because "1 voitures" is the kind of thing users notice. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n > 1 ? many : one}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic tint for an avatar, so the same person keeps the same colour. */
export function avatarTint(seed: string | null | undefined): string {
  const tints = ["#002089", "#e76f2e", "#3E2C23", "#00508a", "#7a6355", "#15803d"];
  if (!seed) return tints[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return tints[Math.abs(hash) % tints.length];
}
