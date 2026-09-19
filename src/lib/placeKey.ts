/**
 * A place name folded to a comparison key.
 *
 * `listings.city` is free text a partner types into a box, so the only hôtel
 * actually in Cap-Haïtien carries the city "cap haitien" — no hyphen, no
 * diaeresis, lower case. Compared literally it matched nothing: not the
 * destination's count, not the search. A traveller clicking the Cap-Haïtien
 * card was told there were no hébergements there while one sat in the
 * catalogue.
 *
 * This is the browser half of `public.place_key()` in the database, and the two
 * have to fold the same way. If they drift, the count on a destination card and
 * the results behind it start disagreeing — which is exactly the bug this
 * replaced, moved one step along.
 *
 * `normalize("NFD")` splits an accented letter into its base plus a combining
 * mark, and the range strips the marks; the SQL side uses `translate` over the
 * same set because it needs to stay immutable.
 */
export function placeKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
