import { BedDouble, Bus, Car, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Constants } from "../types/database";
import type { Enums } from "../types/database";

/**
 * What PAPOT sells, in one place.
 *
 * There were five copies of this dictionary — the search heading, the cart's
 * label/icon/suggestion trio, the checkout summary, the traveller panel's
 * service badge and the admin listings table — and none of them knew about the
 * others. Three said "Restaurant" and one said "Table"; the cart's was typed
 * `Record<string, string>` so adding a service to it failed silently, while the
 * search's was `Record<Kind, …>` and failed loudly. Adding transport meant
 * finding all five.
 *
 * `KINDS` is the generated runtime array, not a literal: a fifth service
 * appears here the moment the enum has it, and `isKind` is then a whitelist
 * that cannot fall behind the database. The old whitelist was
 * `["stay", "car", "restaurant"].includes(…)`, which silently answered "stay"
 * for `?kind=bus`.
 */
export type Kind = Enums<"listing_kind">;

export const KINDS: readonly Kind[] = Constants.public.Enums.listing_kind;

export const isKind = (v: unknown): v is Kind =>
  typeof v === "string" && (KINDS as readonly string[]).includes(v);

export type KindMeta = {
  /** Lower case, for a sentence: "1 hébergement trouvé". */
  one: string;
  many: string;
  /** Capitalised, for a label, a badge or a column. */
  label: string;
  icon: LucideIcon;
  /** Where to go to find one. */
  search: string;
  /** What a price is per, when it is per anything. */
  unit?: string;
};

export const KIND: Record<Kind, KindMeta> = {
  stay: {
    one: "hébergement",
    many: "hébergements",
    label: "Hébergement",
    icon: BedDouble,
    search: "/search?kind=stay",
    unit: "nuit",
  },
  car: {
    one: "voiture",
    many: "voitures",
    label: "Voiture",
    icon: Car,
    search: "/search?kind=car",
    unit: "jour",
  },
  restaurant: {
    one: "restaurant",
    many: "restaurants",
    label: "Restaurant",
    icon: UtensilsCrossed,
    search: "/search?kind=restaurant",
  },
  bus: {
    one: "trajet",
    many: "trajets",
    label: "Transport",
    icon: Bus,
    // Transport has its own entry point rather than a tab on /search: the
    // question is "from where, to where, which day", which is not the question
    // the other three answer.
    search: "/bus",
    unit: "place",
  },
};

/** The label a card, a badge or a table column shows for a kind. */
export const kindLabel = (kind: string | null | undefined): string =>
  isKind(kind) ? KIND[kind].label : "—";
