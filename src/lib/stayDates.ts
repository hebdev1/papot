/**
 * When the traveller arrives and when they leave.
 *
 * The home page has always collected these two dates and put them in the URL.
 * The fiche ignored them and used two constants written into the file —
 * `2026-10-12` and `2026-10-16` — so every séjour and every voiture on the site
 * was booked for the same four nights of October, whatever the visitor had
 * asked for.
 *
 * That was harmless while nothing counted. It stopped being harmless the moment
 * the database started refusing a room already sold: with one date for
 * everybody, the first buyer of a one-room type would have locked out every
 * visitor after them, for good. Real dates are what make the availability check
 * a protection rather than a wall.
 *
 * Dates are half-open, the way the database counts them: arriving on the 12th
 * and leaving on the 16th occupies four nights and leaves the 16th free for the
 * next guest.
 */

/** Availability is decided in Port-au-Prince, so "today" has to be too. */
export const todayInHaiti = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince" }).format(new Date());

export type StayDates = { checkin: string; checkout: string };

export const MAX_NIGHTS = 90;

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * A window that moves with the calendar. A fixed default is a date that goes
 * stale: `2026-10-12` was a month away when it was written and is a date in the
 * past to anyone who opens the site next spring.
 */
export function defaultStayDates(): StayDates {
  const base = todayInHaiti();
  return { checkin: shift(base, 14), checkout: shift(base, 18) };
}

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Reads a stay window from a query string. Anything missing, malformed, in the
 * past or inside out falls back to the rolling default — a fiche never shows a
 * price for nights that cannot be sold.
 */
export function readStayDates(params: URLSearchParams): StayDates {
  const fallback = defaultStayDates();
  const checkin = params.get("checkin");
  const checkout = params.get("checkout");

  if (!isDate(checkin) || !isDate(checkout)) return fallback;
  if (checkin < todayInHaiti()) return fallback;
  if (checkout <= checkin) return { checkin, checkout: shift(checkin, 1) };
  if (nightsBetween(checkin, checkout) > MAX_NIGHTS) return { checkin, checkout: shift(checkin, MAX_NIGHTS) };

  return { checkin, checkout };
}

/** The pair to put in a query string, so a shared link keeps its dates. */
export const stayDatesQuery = (d: StayDates): Record<string, string> => ({
  checkin: d.checkin,
  checkout: d.checkout,
});

/** Nights between two half-open dates. Always at least one. */
export function nightsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  const n = Math.round((b - a) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Keeps a window coherent while it is being edited: moving the arrival past the
 * departure pushes the departure along instead of leaving an impossible pair on
 * screen for the traveller to puzzle over.
 */
export function withCheckin(d: StayDates, checkin: string): StayDates {
  if (!isDate(checkin)) return d;
  return checkin >= d.checkout ? { checkin, checkout: shift(checkin, 1) } : { ...d, checkin };
}

export function withCheckout(d: StayDates, checkout: string): StayDates {
  if (!isDate(checkout)) return d;
  return checkout <= d.checkin ? { ...d, checkout: shift(d.checkin, 1) } : { ...d, checkout };
}

/** "12 oct." — the short form the booking panel prints above each field. */
export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
