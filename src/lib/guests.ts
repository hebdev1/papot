/**
 * How many people are travelling.
 *
 * The number was a string — "2 adultes" — held in state with no setter, printed
 * in four places and carried nowhere. It now travels in the URL, so a search
 * that was shared or reloaded keeps the party it was made for, and it reaches
 * `booking_items.party` where the rest of the system can see it.
 *
 * Nothing validates it against a capacity: `listing_units` records how many
 * units a room type has, not how many people it sleeps. The figure is recorded
 * faithfully and not checked, which is the honest state of it until the form
 * that would collect that capacity exists.
 */

export type Guests = { adults: number; children: number };

export const DEFAULT_GUESTS: Guests = { adults: 2, children: 0 };

export const MAX_ADULTS = 16;
export const MAX_CHILDREN = 10;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Reads a party from a query string, falling back to two adults. */
export function readGuests(params: URLSearchParams): Guests {
  const adults = Number(params.get("adults"));
  const children = Number(params.get("children"));
  return {
    adults: Number.isFinite(adults) && adults > 0 ? clamp(Math.trunc(adults), 1, MAX_ADULTS) : DEFAULT_GUESTS.adults,
    children:
      Number.isFinite(children) && children > 0 ? clamp(Math.trunc(children), 0, MAX_CHILDREN) : DEFAULT_GUESTS.children,
  };
}

/** The pair to put in a query string. Children are omitted when there are none. */
export function guestsQuery(g: Guests): Record<string, string> {
  return g.children > 0
    ? { adults: String(g.adults), children: String(g.children) }
    : { adults: String(g.adults) };
}

/** "2 adultes · 1 enfant" — the children half disappears when there are none. */
export function formatGuests(g: Guests): string {
  const a = `${g.adults} adulte${g.adults > 1 ? "s" : ""}`;
  return g.children > 0 ? `${a} · ${g.children} enfant${g.children > 1 ? "s" : ""}` : a;
}

/** What `booking_items.party` records: everyone who occupies a place. */
export const partySize = (g: Guests) => g.adults + g.children;
