import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { StayCard } from "../components/StayCard";
import { formatGuests, readGuests } from "../lib/guests";
import { CarCard } from "../components/CarCard";
import { RestaurantCard } from "../components/RestaurantCard";
import { supabase } from "../lib/supabase";
import { useUsdHtgRate } from "../lib/currency";
import { attrsOf, type ListingRow } from "../lib/listings";
import type { Enums } from "../types/database";
import { CarFilters, carMatches, emptyCarFilters, type CarDetail, type CarFilterState } from "../components/CarFilters";
import { RestaurantFilters, restaurantMatches, emptyRestaurantFilters, type RestaurantDetail, type RestaurantFilterState } from "../components/RestaurantFilters";

type Kind = Enums<"listing_kind">;

const STAY_TYPES = ["Maison d'hôtes", "Villa", "Appartement", "Petit hôtel", "B&B", "Auberge"];
const ESSENTIALS = ["Générateur", "Inverter", "Réserve d'eau", "Gardiennage", "Parking", "Piscine", "Wi-Fi"];
const CANCELLATION = [
  { id: "flexible", label: "Flexible — 24 h avant" },
  { id: "moderate", label: "Modérée — 5 jours" },
  { id: "all", label: "Toutes" },
];

/** [singular, plural] — French agreement on the results heading. */
const KIND_LABEL: Record<Kind, [string, string]> = {
  stay: ["hébergement", "hébergements"],
  car: ["voiture", "voitures"],
  restaurant: ["restaurant", "restaurants"],
};

const checkbox = (on: boolean) =>
  `w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
    on ? "bg-[#6ad7fb] border-[#6ad7fb]" : "border-[#e2d5c3]"
  }`;

const row = (on: boolean) =>
  `w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg transition-all text-left ${
    on ? "bg-[#002089] text-white font-semibold" : "text-[#3E2C23] hover:bg-[#E9F9FE]"
  }`;

/** Canvas 1a — /search. The Vols tab has no inventory, so it reports as empty. */
export function Search() {
  const [params, setParams] = useSearchParams();
  const rate = useUsdHtgRate();

  const rawKind = params.get("kind") ?? "stay";
  const kind = (["stay", "car", "restaurant"].includes(rawKind) ? rawKind : "stay") as Kind;
  const unsupported = rawKind === "flight";
  const where = params.get("where") ?? "";
  // The party travels in the URL, so a shared or reloaded search keeps the
  // one it was made for.
  const guests = readGuests(params);

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [maxPrice, setMaxPrice] = useState(300);
  const [types, setTypes] = useState<string[]>([]);
  const [essentials, setEssentials] = useState<string[]>([]);
  const [cancellation, setCancellation] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [carDetails, setCarDetails] = useState<Record<string, CarDetail>>({});
  const [carFilters, setCarFilters] = useState<CarFilterState>(() => emptyCarFilters(300));
  const [restoDetails, setRestoDetails] = useState<Record<string, RestaurantDetail>>({});
  const [restoFilters, setRestoFilters] = useState<RestaurantFilterState>(emptyRestaurantFilters);

  const checkin = params.get("checkin");
  const checkout = params.get("checkout");
  const nights = useMemo(() => {
    if (!checkin || !checkout) return 4;
    const n = Math.round((new Date(checkout).getTime() - new Date(checkin).getTime()) / 86_400_000);
    return Number.isFinite(n) && n > 0 ? n : 4;
  }, [checkin, checkout]);

  useEffect(() => {
    if (unsupported) {
      setListings([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("published", true)
        .eq("kind", kind)
        .order("position");
      if (cancelled) return;
      if (error) console.error("Search failed:", error);
      const rows = data ?? [];
      setListings(rows);

      if (kind === "restaurant" && rows.length) {
        const { data: rd, error: rdErr } = await supabase.from("restaurant_details").select("*");
        if (cancelled) return;
        if (rdErr) console.error("Restaurant details failed:", rdErr);
        const byId: Record<string, RestaurantDetail> = {};
        (rd ?? []).forEach(d => {
          byId[d.listing_id] = d;
        });
        setRestoDetails(byId);
      }

      if (kind === "car" && rows.length) {
        const { data: cd, error: cdErr } = await supabase.from("car_details").select("*");
        if (cancelled) return;
        if (cdErr) console.error("Car details failed:", cdErr);
        const byId: Record<string, CarDetail> = {};
        (cd ?? []).forEach(d => {
          byId[d.listing_id] = d;
        });
        setCarDetails(byId);
        const prices = rows.map(r => Number(r.price));
        setCarFilters(emptyCarFilters(Math.ceil(Math.max(...prices))));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, unsupported]);

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]));

  const carPriceBounds = useMemo(() => {
    const prices = listings.map(l => Number(l.price));
    return prices.length
      ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
      : { min: 0, max: 300 };
  }, [listings]);

  const reset = () => {
    setMaxPrice(300);
    setTypes([]);
    setEssentials([]);
    setCancellation("all");
    setCarFilters(emptyCarFilters(carPriceBounds.max));
    setRestoFilters(emptyRestaurantFilters());
  };

  const results = useMemo(() => {
    const q = where.trim().toLowerCase();
    let out = listings.filter(l => {
      if (kind === "car") {
        const d = carDetails[l.id];
        const haystack = `${l.city} ${l.location} ${l.name} ${d?.make ?? ""} ${d?.model ?? ""}`.toLowerCase();
        if (q && !haystack.includes(q)) return false;
        return carMatches(d, Number(l.price), carFilters);
      }
      if (kind === "restaurant") {
        const d = restoDetails[l.id];
        const haystack = `${l.city} ${l.location} ${l.name} ${d?.cuisine ?? ""}`.toLowerCase();
        if (q && !haystack.includes(q)) return false;
        return restaurantMatches(l, d, restoFilters);
      }
      if (q && !`${l.city} ${l.location} ${l.name}`.toLowerCase().includes(q)) return false;
      if (l.price > maxPrice) return false;
      if (types.length && !types.includes(l.type)) return false;
      if (essentials.length && !essentials.every(e => l.amenities.includes(e))) return false;
      if (cancellation !== "all" && attrsOf(l).cancellation_kind !== cancellation) return false;
      return true;
    });
    if (sort === "price") out = [...out].sort((a, b) => a.price - b.price);
    // Unrated listings sort last rather than to the top via NaN.
    if (sort === "rating")
      out = [...out].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    return out;
  }, [listings, where, kind, maxPrice, types, essentials, cancellation, sort, carDetails, carFilters, restoDetails, restoFilters]);

  return (
    <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-[#e2d5c3] p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="flex items-center gap-2 font-display font-bold text-[#3E2C23]">
                <Icon.Filter /> Filtres
              </span>
              <button onClick={reset} className="text-xs font-semibold text-[#002089] hover:underline">
                Réinitialiser
              </button>
            </div>

            {kind === "car" && (
              <CarFilters
                details={Object.values(carDetails)}
                filters={carFilters}
                setFilters={setCarFilters}
                priceBounds={carPriceBounds}
              />
            )}

            {kind === "restaurant" && (
              <RestaurantFilters
                listings={listings}
                details={Object.values(restoDetails)}
                filters={restoFilters}
                setFilters={setRestoFilters}
              />
            )}

            {kind === "stay" && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-3">
                  Prix par nuit
                </p>
                <input
                  type="range"
                  min={40}
                  max={300}
                  step={5}
                  value={maxPrice}
                  onChange={e => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-[#002089]"
                />
                <div className="flex justify-between text-xs text-[#7a6355] mt-1">
                  <span>40 $</span>
                  <span className="font-semibold text-[#002089]">{maxPrice} $</span>
                </div>
              </div>
            )}

            {kind === "stay" && (
              <>
                <div className="mb-5">
                  <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-3">Type de logement</p>
                  <div className="space-y-2">
                    {STAY_TYPES.map(t => (
                      <button key={t} onClick={() => toggle(setTypes, t)} className={row(types.includes(t))}>
                        <span className={checkbox(types.includes(t))}>{types.includes(t) && <Icon.Check />}</span>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-3">
                    Essentiels en Haïti
                  </p>
                  <div className="space-y-2">
                    {ESSENTIALS.map(t => (
                      <button key={t} onClick={() => toggle(setEssentials, t)} className={row(essentials.includes(t))}>
                        <span className={checkbox(essentials.includes(t))}>
                          {essentials.includes(t) && <Icon.Check />}
                        </span>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-3">Annulation</p>
                  <div className="space-y-2">
                    {CANCELLATION.map(c => (
                      <button key={c.id} onClick={() => setCancellation(c.id)} className={row(cancellation === c.id)}>
                        <span className={checkbox(cancellation === c.id)}>
                          {cancellation === c.id && <Icon.Check />}
                        </span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#002089]">
                {results.length} {KIND_LABEL[kind][results.length > 1 ? 1 : 0]}
                {where && ` à ${where}`}
              </h1>
              {kind === "stay" && (
                <p className="text-[#7a6355] text-sm mt-1">
                  {nights} nuit{nights > 1 ? "s" : ""} · {formatGuests(guests)} · prix totaux, taxes incluses
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-[#7a6355]">
              Trier :
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="border border-[#e2d5c3] rounded-xl px-3 py-2 text-sm text-[#3E2C23] bg-white focus:outline-none focus:border-[#6ad7fb]"
              >
                <option value="recommended">recommandés</option>
                <option value="price">prix croissant</option>
                <option value="rating">mieux notés</option>
              </select>
            </label>
          </div>

          {unsupported ? (
            <EmptyState
              title="Les vols arrivent bientôt"
              body="Cette section de la maquette n'a pas encore d'inventaire."
            />
          ) : !loaded ? (
            <p className="text-sm text-[#7a6355]">Chargement…</p>
          ) : results.length === 0 ? (
            <EmptyState
              title="Aucun résultat"
              body="Vos filtres sont trop restrictifs. Élargissez le budget ou retirez un critère."
              action={
                <button
                  onClick={reset}
                  className="mt-4 bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Réinitialiser les filtres
                </button>
              }
            />
          ) : kind === "stay" ? (
            <div className="flex flex-col gap-5">
              {results.map(l => (
                <StayCard key={l.id} listing={l} rate={rate} nights={nights} query={params.toString()} />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-5">
              {results.map(l =>
                kind === "car" ? (
                  <CarCard key={l.id} listing={l} rate={rate} detail={carDetails[l.id]} />
                ) : (
                  <RestaurantCard key={l.id} listing={l} />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#e2d5c3] rounded-2xl p-10 text-center">
      <p className="font-display text-xl font-bold text-[#3E2C23]">{title}</p>
      <p className="text-sm text-[#7a6355] mt-1.5 max-w-sm mx-auto leading-relaxed">{body}</p>
      {action}
    </div>
  );
}
