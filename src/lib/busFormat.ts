/**
 * The pure half of the bus helpers: clock arithmetic and slugs, no Supabase.
 *
 * Split out of `bus.ts` so tests can import them without constructing a
 * Supabase client — and because these are the parts with arithmetic worth
 * pinning down. `bus.ts` re-exports them, so every existing import still
 * works.
 */

export const busDuration = (minutes: number | null | undefined) => {
  const m = Number(minutes) || 0;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
};

/** "06:00:00" -> "06:00" */
export const busTime = (t: string | null | undefined) => (t ?? "").slice(0, 5);

/**
 * The arrival a card shows.
 *
 * Derived from the departure time plus the duration, in local clock terms, and
 * marked when it lands on the next day. Nothing stores an arrival instant: the
 * schema keeps a clock time and a number of minutes precisely so that Haiti's
 * daylight saving cannot make a stored arrival wrong for part of the year.
 */
export const busArrival = (departsAt: string, durationMinutes: number) => {
  const [h, m] = busTime(departsAt).split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + (Number(durationMinutes) || 0);
  const day = Math.floor(total / 1440);
  const mins = ((total % 1440) + 1440) % 1440;
  const label = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { label, nextDay: day > 0 };
};

/**
 * Turns a city into the form used in a shareable search URL.
 *
 * It must agree with the database's `slugify`, because `/bus/:from/:to` is
 * resolved by matching these against the cities `bus_cities_served` returns.
 * Accents are folded rather than dropped: "Cap-Haïtien" and "cap-haitien" have
 * to be the same place or the link 404s for the half of Haiti that types the
 * accent.
 */
export const citySlug = (city: string) =>
  (city ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
