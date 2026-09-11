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

/** Canvas rates every vertical /5 and prints a comma decimal: "4,9". */
export const formatRating = (row: Pick<ListingRow, "rating">) =>
  row.rating.toFixed(1).replace(".", ",");

export const isSoldOut = (row: ListingRow) => attrsOf(row).sold_out === true;
