import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ToolSpec } from "./provider.ts";

/**
 * §12, §13, §100 — the tool layer.
 *
 * The model never touches the database. It asks for a tool by name, and the
 * tool runs a query **through the caller's own client**, so row level security
 * is the gate — the same gate the rest of PAPOT uses. Nothing here re-implements
 * authorization, because a second authorization system is a second place to get
 * it wrong.
 *
 * Phase 0 registers read tools only. `maxRisk` below refuses anything heavier
 * rather than relying on whoever adds the next tool to remember.
 */

export type Risk = "low" | "medium" | "high" | "critical";

export type Tool = {
  spec: ToolSpec;
  risk: Risk;
  /** Whether a visitor who has not signed in may call it (§101). */
  anonymous: boolean;
  execute: (input: Record<string, unknown>, db: SupabaseClient) => Promise<unknown>;
};

const KINDS = ["stay", "car", "restaurant"] as const;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const cap = (n: number | undefined, fallback: number, max: number) =>
  Math.min(Math.max(n ?? fallback, 1), max);

/* ─────────────────────────────── the tools ─────────────────────────────── */

const searchListings: Tool = {
  risk: "low",
  anonymous: true,
  spec: {
    name: "searchListings",
    description:
      "Cherche dans l'inventaire PAPOT : hébergements (stay), voitures (car) ou restaurants (restaurant). " +
      "Ne renvoie que des annonces publiées. Utilise cet outil avant de citer un établissement ou un prix.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...KINDS], description: "Le métier recherché." },
        city: { type: "string", description: "Ville ou zone, par exemple Jacmel." },
        maxPrice: { type: "number", description: "Prix maximum par nuit ou par jour, en USD." },
        minRating: { type: "number", description: "Note minimale sur 5." },
        limit: { type: "number", description: "Nombre de résultats, 10 par défaut." },
      },
      required: ["kind"],
    },
  },
  async execute(input, db) {
    const kind = str(input.kind);
    if (!kind || !KINDS.includes(kind as (typeof KINDS)[number])) {
      throw new Error("kind doit valoir stay, car ou restaurant.");
    }

    let q = db
      .from("listings")
      .select("id, name, kind, type, city, location, price, currency, rating, reviews, stars, amenities, badge")
      .eq("kind", kind)
      .eq("published", true)
      .limit(cap(num(input.limit), 10, 25));

    const city = str(input.city);
    if (city) q = q.ilike("city", `%${city}%`);
    const maxPrice = num(input.maxPrice);
    if (maxPrice !== undefined) q = q.lte("price", maxPrice);
    const minRating = num(input.minRating);
    if (minRating !== undefined) q = q.gte("rating", minRating);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { count: data?.length ?? 0, listings: data ?? [] };
  },
};

const getListingDetails: Tool = {
  risk: "low",
  anonymous: true,
  spec: {
    name: "getListingDetails",
    description:
      "Détaille une annonce : ses types de chambre pour un séjour, sa fiche restaurant, ses caractéristiques " +
      "véhicule. Utilise l'identifiant rendu par searchListings.",
    input_schema: {
      type: "object",
      properties: { listingId: { type: "string", description: "L'identifiant de l'annonce." } },
      required: ["listingId"],
    },
  },
  async execute(input, db) {
    const id = str(input.listingId);
    if (!id) throw new Error("listingId est requis.");

    const { data: listing, error } = await db
      .from("listings")
      .select("id, name, kind, type, city, location, price, currency, rating, reviews, stars, amenities, attrs")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!listing) return { found: false };

    const [units, resto, car] = await Promise.all([
      db.from("listing_units").select("id, name, detail, price, available, units").eq("listing_id", id),
      db.from("restaurant_details").select("*").eq("listing_id", id).maybeSingle(),
      db.from("car_details").select("*").eq("listing_id", id).maybeSingle(),
    ]);

    return {
      found: true,
      listing,
      units: units.data ?? [],
      restaurant: resto.data ?? null,
      car: car.data ?? null,
    };
  },
};

const checkRestaurantAvailability: Tool = {
  risk: "low",
  anonymous: true,
  spec: {
    name: "checkRestaurantAvailability",
    description:
      "Créneaux réellement libres d'un restaurant pour une date et un nombre de convives. " +
      "C'est la seule source de vérité sur les tables : n'annonce jamais une disponibilité sans l'avoir appelée.",
    input_schema: {
      type: "object",
      properties: {
        listingId: { type: "string" },
        date: { type: "string", description: "Date au format AAAA-MM-JJ." },
        party: { type: "number", description: "Nombre de convives." },
      },
      required: ["listingId", "date", "party"],
    },
  },
  async execute(input, db) {
    const { data, error } = await db.rpc("restaurant_availability", {
      p_listing: str(input.listingId),
      p_date: str(input.date),
      p_party: cap(num(input.party), 2, 20),
    });
    if (error) throw new Error(error.message);
    return data;
  },
};

const getPackages: Tool = {
  risk: "low",
  anonymous: true,
  spec: {
    name: "getPackages",
    description:
      "Les offres d'une annonce : plusieurs prestations réunies sous un prix unique. " +
      "Le prix et l'économie sont calculés par la base, jamais par toi.",
    input_schema: {
      type: "object",
      properties: {
        listingId: { type: "string" },
        units: { type: "number", description: "Nombre de nuits ou de jours. 1 par défaut." },
      },
      required: ["listingId"],
    },
  },
  async execute(input, db) {
    const { data, error } = await db
      .from("partner_packages")
      .select("id, name, description, price, basis, min_units, usage_limit, used_count, package_lines(label, quantity, recurring)")
      .eq("listing_id", str(input.listingId))
      .eq("active", true)
      .order("position");
    if (error) throw new Error(error.message);

    const units = cap(num(input.units), 1, 60);
    const quoted = await Promise.all(
      (data ?? []).map(async (p: Record<string, unknown>) => {
        const { data: q } = await db.rpc("package_quote", { p_package: p.id, p_units: units });
        return { ...p, quote: q ?? null };
      }),
    );
    return { count: quoted.length, packages: quoted };
  },
};

const getDestinations: Tool = {
  risk: "low",
  anonymous: true,
  spec: {
    name: "getDestinations",
    description: "Les destinations que PAPOT couvre en Haïti.",
    input_schema: { type: "object", properties: {} },
  },
  async execute(_input, db) {
    const { data, error } = await db.from("destinations").select("*").order("position");
    if (error) throw new Error(error.message);
    return { destinations: data ?? [] };
  },
};

/* ────────────────────────────── the registry ────────────────────────────── */

const ALL: Tool[] = [
  searchListings,
  getListingDetails,
  checkRestaurantAvailability,
  getPackages,
  getDestinations,
];

const ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Phase 0 carries no write tools (§119). The ceiling is enforced here rather
 * than by convention, so a tool that books something cannot be registered by
 * accident before the phase that reviewed it.
 */
export function registry(opts: { anonymous: boolean; maxRisk: Risk }): Tool[] {
  return ALL.filter(
    t => ORDER[t.risk] <= ORDER[opts.maxRisk] && (!opts.anonymous || t.anonymous),
  );
}

export function specs(tools: Tool[]): ToolSpec[] {
  return tools.map(t => t.spec);
}

/**
 * §88 — what reaches the audit trail.
 *
 * Storing what we are forbidden to send a provider would only move the problem
 * into the database, so anything that looks like a person rather than a query
 * is dropped before the row is written.
 */
const SENSITIVE = /(email|mail|phone|tel|passport|card|cvv|token|secret|password|dob)/i;

export function redact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    out[k] = SENSITIVE.test(k) ? "[rédigé]" : v;
  }
  return out;
}
