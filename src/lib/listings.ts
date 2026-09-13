import type { Tables } from "../types/database";

export type ListingRow = Tables<"listings">;
export type DestinationRow = Tables<"destinations">;

/** Narrowed view of the per-kind `attrs` jsonb. All fields optional by design. */
export type ListingAttrs = {
  blurb?: string;
  cancellation?: string;
  cancellation_kind?: "flexible" | "moderate";
  min_nights?: number;
  sold_out?: boolean;
  next_available?: string;
  price_band?: string;
  cuisine?: string;
  slot_label?: string;
  slots?: string[];
  full?: boolean;
  body?: string;
  perk?: string;
  with_driver?: boolean;
};

export const attrsOf = (row: ListingRow): ListingAttrs =>
  (row.attrs ?? {}) as ListingAttrs;

/**
 * Canvas rates every vertical /5 and prints a comma decimal: "4,9".
 *
 * Returns null when a listing has no rating yet -- a partner's new listing has
 * none until someone reviews it, and callers show nothing rather than "0,0",
 * which would read as a terrible score instead of a new arrival.
 */
export const formatRating = (row: Pick<ListingRow, "rating">) =>
  row.rating === null || row.rating === undefined
    ? null
    : Number(row.rating).toFixed(1).replace(".", ",");

export const isSoldOut = (row: ListingRow) => attrsOf(row).sold_out === true;
