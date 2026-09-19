import { Icon } from "./Icon";
import { attrsOf, type ListingRow } from "../lib/listings";
import type { Tables } from "../types/database";

export type RestaurantDetail = Tables<"restaurant_details">;

export type RestaurantFilterState = {
  cuisines: string[];
  bands: string[];
  cities: string[];
  services: string[];
  zones: string[];
  features: string[];
  minRating: number | null;
  availableTonight: boolean;
  groupsOnly: boolean;
};

export const emptyRestaurantFilters = (): RestaurantFilterState => ({
  cuisines: [],
  bands: [],
  cities: [],
  services: [],
  zones: [],
  features: [],
  minRating: null,
  availableTonight: false,
  groupsOnly: false,
});

const hasAll = (have: string[] | null | undefined, want: string[]) =>
  want.every(w => (have ?? []).includes(w));

export function restaurantMatches(
  listing: ListingRow,
  d: RestaurantDetail | undefined,
  f: RestaurantFilterState,
): boolean {
  const a = attrsOf(listing);

  if (f.minRating !== null && (listing.rating ?? 0) < f.minRating) return false;
  // "Complet" in the canvas means no bookable slot tonight.
  if (f.availableTonight && (a.full === true || (a.slots ?? []).length === 0)) return false;
  if (f.cities.length && !f.cities.includes(listing.city)) return false;

  const anyDetailFilter =
    f.cuisines.length || f.bands.length || f.services.length || f.zones.length || f.features.length || f.groupsOnly;
  if (!d) return !anyDetailFilter;

  if (f.cuisines.length && !f.cuisines.includes(d.cuisine)) return false;
  if (f.bands.length && !f.bands.includes(d.price_band)) return false;
  if (f.services.length && !hasAll(d.services, f.services)) return false;
  if (f.zones.length && !hasAll(d.zones, f.zones)) return false;
  if (f.features.length && !hasAll(d.features, f.features)) return false;
  if (f.groupsOnly && !d.accepts_groups) return false;
  return true;
}

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-[13px] font-medium border-2 transition-colors ${
    on
      ? "bg-[#002089] border-[#002089] text-white"
      : "bg-white border-[#e2d5c3] text-[#3E2C23] hover:border-[#002089]"
  }`;

const rowBtn = (on: boolean) =>
  `w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg transition-all text-left ${
    on ? "bg-[#002089] text-white font-semibold" : "text-[#3E2C23] hover:bg-[#DAF5FE]"
  }`;

const box = (on: boolean) =>
  `w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
    on ? "bg-[#6ad7fb] border-[#6ad7fb]" : "border-[#e2d5c3]"
  }`;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-2.5">{title}</p>
      {children}
    </div>
  );
}

/** Canvas 3a filter row (Créole · Fruits de mer · Grillades · villes), expanded. */
export function RestaurantFilters({
  listings,
  details,
  filters,
  setFilters,
}: {
  listings: ListingRow[];
  details: RestaurantDetail[];
  filters: RestaurantFilterState;
  setFilters: React.Dispatch<React.SetStateAction<RestaurantFilterState>>;
}) {
  const uniq = (vals: string[]) => Array.from(new Set(vals)).sort();
  const flat = (fn: (d: RestaurantDetail) => string[] | null) =>
    uniq(details.flatMap(d => fn(d) ?? []));

  const toggle = (key: keyof RestaurantFilterState, value: string) =>
    setFilters(prev => {
      const list = prev[key] as string[];
      return { ...prev, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });

  // Bands sorted by length so $ precedes $$ precedes $$$.
  const bands = uniq(details.map(d => d.price_band)).sort((a, b) => a.length - b.length);

  return (
    <>
      <Group title="Cuisine">
        <div className="flex flex-wrap gap-1.5">
          {uniq(details.map(d => d.cuisine)).map(c => (
            <button key={c} onClick={() => toggle("cuisines", c)} className={chip(filters.cuisines.includes(c))}>
              {c}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Budget">
        <div className="flex flex-wrap gap-1.5">
          {bands.map(b => (
            <button key={b} onClick={() => toggle("bands", b)} className={chip(filters.bands.includes(b))}>
              {b}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Ville">
        <div className="flex flex-wrap gap-1.5">
          {uniq(listings.map(l => l.city)).map(c => (
            <button key={c} onClick={() => toggle("cities", c)} className={chip(filters.cities.includes(c))}>
              {c}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Service">
        <div className="space-y-2">
          {flat(d => d.services).map(s => (
            <button key={s} onClick={() => toggle("services", s)} className={rowBtn(filters.services.includes(s))}>
              <span className={box(filters.services.includes(s))}>
                {filters.services.includes(s) && <Icon.Check />}
              </span>
              {s}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Zone">
        <div className="space-y-2">
          {flat(d => d.zones).map(z => (
            <button key={z} onClick={() => toggle("zones", z)} className={rowBtn(filters.zones.includes(z))}>
              <span className={box(filters.zones.includes(z))}>{filters.zones.includes(z) && <Icon.Check />}</span>
              {z}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Note minimum">
        <div className="flex flex-wrap gap-1.5">
          {[4.5, 4.7, 4.9].map(n => (
            <button
              key={n}
              onClick={() => setFilters(p => ({ ...p, minRating: p.minRating === n ? null : n }))}
              className={chip(filters.minRating === n)}
            >
              {n.toFixed(1).replace(".", ",")}+
            </button>
          ))}
        </div>
      </Group>

      <Group title="Options">
        <div className="space-y-2">
          {flat(d => d.features).map(f => (
            <button key={f} onClick={() => toggle("features", f)} className={rowBtn(filters.features.includes(f))}>
              <span className={box(filters.features.includes(f))}>
                {filters.features.includes(f) && <Icon.Check />}
              </span>
              {f}
            </button>
          ))}
          <button
            onClick={() => setFilters(p => ({ ...p, groupsOnly: !p.groupsOnly }))}
            className={rowBtn(filters.groupsOnly)}
          >
            <span className={box(filters.groupsOnly)}>{filters.groupsOnly && <Icon.Check />}</span>
            Accepte les groupes
          </button>
          <button
            onClick={() => setFilters(p => ({ ...p, availableTonight: !p.availableTonight }))}
            className={rowBtn(filters.availableTonight)}
          >
            <span className={box(filters.availableTonight)}>{filters.availableTonight && <Icon.Check />}</span>
            Disponible ce soir
          </button>
        </div>
      </Group>
    </>
  );
}
