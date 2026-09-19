import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Badge } from "../components/ui/cvui-badge";
import { supabase } from "../lib/supabase";
import { formatHtg, formatUsd, useUsdHtgRate } from "../lib/currency";
import { attrsOf, formatRating, type ListingRow } from "../lib/listings";
import { formatDateRange, nightsBetween, useCart, type CartItem } from "../lib/cart";
import { useFoodCart } from "../lib/foodCart";
import { GuestsPicker } from "../components/GuestsPicker";
import { StayDatesPicker } from "../components/StayDatesPicker";
import { formatGuests, partySize, readGuests, type Guests } from "../lib/guests";
import { readStayDates, type StayDates } from "../lib/stayDates";
import { availabilityNote, useStayAvailability, useUnitsAvailability } from "../lib/availability";
import type { Tables } from "../types/database";

type Unit = Tables<"listing_units">;
/** The dish carries its section, so the menu can be grouped without a second query. */
type MenuItem = Tables<"menu_items"> & {
  menu_categories: { name: string; position: number } | null;
};
type PrivateOption = Tables<"private_options">;
type Variation = { id: string; item_id: string; name: string; price: number; position: number };
type OptionGroup = {
  id: string;
  name: string;
  selection: string;
  required: boolean;
  min_select: number;
  max_select: number;
  position: number;
};
type MealTemplate = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  base_price: number;
  position: number;
};
type MealGroup = {
  id: string;
  template_id: string;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  position: number;
};
/** An option already carries the name of whatever it points at. */
type MealOption = {
  id: string;
  group_id: string;
  label: string;
  price_delta: number;
  max_quantity: number | null;
  position: number;
};
type Option = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  kind: string;
  position: number;
};
type KV = { k: string; v: string };
type Pickup = { name: string; detail: string; fee: number };

const card = "bg-white rounded-2xl border border-[#e2d5c3] p-6";
const h2 = "font-display text-xl font-bold text-[#002089] mb-4";
const cta =
  "w-full py-3.5 rounded-xl bg-[#e76f2e] hover:bg-[#d05e20] text-white font-display font-bold text-[15px] shadow-[0_6px_18px_rgba(231,111,46,.3)] transition-colors";
/** A button that cannot act should not look like one that can. */
const disabledCta =
  "!bg-[#e2d5c3] !text-[#7a6355] !shadow-none cursor-not-allowed hover:!bg-[#e2d5c3]";

/** Main tile uses the listing photo when there is one; the rest stay
    placeholders, since the canvas marks the extra shots as "à fournir". */
function Gallery({ labels, more, img, alt }: { labels: string[]; more?: number; img?: string; alt?: string }) {
  return (
    <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[300px] mb-7">
      <div className="col-span-2 row-span-2 bg-[#D6F0FB] rounded-2xl overflow-hidden flex items-center justify-center text-sm text-[#00508a]">
        {img ? (
          <img src={img} alt={alt ?? ""} className="w-full h-full object-cover" />
        ) : (
          labels[0]
        )}
      </div>
      {labels.slice(1, 4).map(l => (
        <div key={l} className="bg-[#D6F0FB] rounded-2xl flex items-center justify-center text-xs text-[#00508a]">
          {l}
        </div>
      ))}
      <div className="bg-[#002089] rounded-2xl flex items-center justify-center text-xs text-white font-semibold">
        {more ? `+${more} photos` : "Galerie"}
      </div>
    </div>
  );
}

export function Property() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // The window the search was made for. The fiche used to override it with two
  // dates written into this file, so every visitor booked the same four nights
  // of October whatever they had asked for.
  const [dates, setDates] = useState<StayDates>(() => readStayDates(params));
  const rate = useUsdHtgRate();
  const cart = useCart();

  const [listing, setListing] = useState<ListingRow | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [privates, setPrivates] = useState<PrivateOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [l, u, m, p] = await Promise.all([
        supabase.from("listings").select("*").eq("id", id).maybeSingle(),
        supabase.from("listing_units").select("*").eq("listing_id", id).order("position"),
        supabase
          .from("menu_items")
          .select("*, menu_categories(name, position)")
          .eq("listing_id", id)
          .eq("available", true)
          .order("position"),
        supabase.from("private_options").select("*").eq("listing_id", id).order("position"),
      ]);
      if (cancelled) return;
      if (l.error) console.error("Failed to load listing:", l.error);
      setListing(l.data ?? null);
      setUnits(u.data ?? []);
      setMenu(m.data ?? []);
      setPrivates(p.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <main className="max-w-7xl mx-auto px-4 py-16 text-[#7a6355]">Chargement…</main>;
  if (!listing)
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-[#002089]">Établissement introuvable</h1>
        <button onClick={() => navigate("/")} className="mt-4 text-[#002089] font-semibold underline">
          Retour à l'accueil
        </button>
      </main>
    );

  const a = attrsOf(listing) as ReturnType<typeof attrsOf> & Record<string, unknown>;

  return (
    <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <p className="text-sm text-[#7a6355] mb-4">{(a.breadcrumb as string) ?? listing.location}</p>

      {listing.kind === "stay" && (
        <StayDetail
          listing={listing}
          a={a}
          units={units}
          rate={rate}
          cart={cart}
          navigate={navigate}
          dates={dates}
          setDates={setDates}
        />
      )}
      {listing.kind === "restaurant" && (
        <RestaurantDetail listing={listing} a={a} menu={menu} privates={privates} cart={cart} navigate={navigate} />
      )}
      {listing.kind === "car" && (
        <CarDetail
          listing={listing}
          a={a}
          rate={rate}
          cart={cart}
          navigate={navigate}
          dates={dates}
          setDates={setDates}
        />
      )}

      {/* A restaurant offer needs the créneau that the reservation panel
          collects, so that one is rendered from inside RestaurantDetail. */}
      {listing.kind !== "restaurant" && (
        <Offers
          listing={listing}
          cart={cart}
          navigate={navigate}
          booking={{
            units: nightsBetween(dates.checkin, dates.checkout),
            starts_on: dates.checkin,
            ends_on: dates.checkout,
            party: 2,
            ready: true,
          }}
        />
      )}
    </main>
  );
}

/* ── 1b — hébergement ───────────────────────────────────── */
function StayDetail({ listing, a, units, rate, cart, navigate, dates, setDates }: any) {
  const [params] = useSearchParams();
  // Seeded from the search that led here, so the party chosen on the home page
  // is still the party when the traveller arrives.
  const [guests, setGuests] = useState<Guests>(() => readGuests(params));
  const [unitId, setUnitId] = useState<string | null>(null);
  const available = units.filter((u: Unit) => u.available);

  // The same function the checkout consults under a lock, asked once for every
  // room type. The traveller learns a room is gone on the fiche, while they can
  // still pick another one — not after filling in a card.
  const byUnit = useUnitsAvailability(listing.id, dates.checkin, dates.checkout);

  // Until the traveller chooses, the panel opens on a room they can actually
  // book. Defaulting to the first one in the list means landing on "complet"
  // while a free room sits directly underneath it.
  const selected: Unit | undefined =
    available.find((u: Unit) => u.id === unitId) ??
    available.find((u: Unit) => byUnit[u.id]?.available !== false) ??
    available[0];
  const chosen = selected ? byUnit[selected.id] : undefined;
  const note = availabilityNote(
    chosen
      ? {
          available: chosen.available,
          reason: chosen.reason,
          left: chosen.units_left ?? undefined,
          taken: chosen.units_taken ?? undefined,
        }
      : null,
  );
  const soldOut = chosen !== undefined && !chosen.available;

  const nights = nightsBetween(dates.checkin, dates.checkout);
  const nightly = Number(selected?.price ?? listing.price);
  const cleaning = Number(a.cleaning_fee ?? 0);
  const service = Number(a.service_fee ?? 0);
  const total = nightly * nights + cleaning + service;

  const book = () => {
    cart.add({
      kind: "stay",
      listing_id: listing.id,
      unit_id: selected?.id ?? null,
      title: `${listing.name}${selected ? ` · ${selected.name}` : ""}`,
      detail: `${formatDateRange(dates.checkin, dates.checkout)} · ${nights} ${unitWord("per_night", nights)} · ${formatGuests(guests)}`,
      amount: total,
      starts_on: dates.checkin,
      ends_on: dates.checkout,
      party: partySize(guests),
    });
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <>
      <Gallery labels={["photo principale", "chambre", "terrasse", "jardin"]} more={a.photos_more as number} img={listing.img || undefined} alt={listing.name} />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#7a6355]">{listing.type}</span>
              {a.verified && (
                <Badge label="Vérifié par PAPOT" variant="primary" appearance="subtle" size="small" />
              )}
            </div>
            <h1 className="font-display text-3xl font-bold text-[#3E2C23]">{listing.name}</h1>
            <p className="text-sm text-[#7a6355] mt-1">{a.subtitle as string}</p>
            <div className="flex items-center gap-3 mt-3 text-sm">
              <span className="bg-[#002089] text-white font-display font-bold px-2.5 py-1 rounded-lg">
                {formatRating(listing)}
              </span>
              <span className="text-[#7a6355]">{listing.reviews} avis</span>
              <span className="text-[#7a6355]">· Hôte depuis {a.host_since as string}</span>
            </div>
            <p className="text-[15px] leading-relaxed text-[#3E2C23] mt-4">{a.description as string}</p>
          </div>

          <section className={card}>
            <h2 className={h2}>Chambres et unités</h2>
            <div className="flex flex-col gap-3">
              {units.map((u: Unit) => {
                const on = selected?.id === u.id;
                // Two different things used to share one sentence. `u.available`
                // is the switch the partner flips to withdraw a room type
                // altogether; the dates are what the availability check answers.
                // The list said "Indisponible ces dates" for both, which was
                // true of neither.
                const state = byUnit[u.id];
                const free = u.available && state?.available !== false;
                // Only real scarcity: a one-room type is not "last available",
                // it is simply a room type with one room.
                const left = state && (state.units_taken ?? 0) > 0 ? state.units_left : null;

                return (
                  <button
                    key={u.id}
                    disabled={!free}
                    onClick={() => setUnitId(u.id)}
                    className={`flex items-center justify-between gap-4 text-left p-4 rounded-xl border-2 transition-colors ${
                      !free
                        ? "border-[#e2d5c3] opacity-60 cursor-not-allowed"
                        : on
                          ? "border-[#002089] bg-[#D6F0FB]"
                          : "border-[#e2d5c3] hover:border-[#002089]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-display font-bold text-[#3E2C23]">{u.name}</p>
                      <p className="text-xs text-[#7a6355] mt-0.5">{u.detail}</p>
                      {free && left !== null && left <= 3 && (
                        <p className="text-xs font-semibold text-[#c2410c] mt-1">
                          {left === 1 ? "Dernière disponible" : `Plus que ${left} à ces dates`}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-display font-bold text-[#002089] shrink-0 text-right">
                      {free ? (
                        `${formatUsd(Number(u.price))} / nuit`
                      ) : (
                        <span className="font-semibold text-[#7a6355]">
                          {!u.available ? "Retirée de la vente" : (state?.reason ?? "Indisponible ces dates")}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Équipements</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {((a.facilities as string[]) ?? []).map(f => (
                <span key={f} className="flex items-center gap-2 text-sm text-[#3E2C23]">
                  <Icon.Check /> {f}
                </span>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Continuité de service</h2>
            <p className="text-sm text-[#3E2C23]">{((a.continuity as string[]) ?? []).join(" · ")}</p>
          </section>

          <section className={card}>
            <h2 className={h2}>Règles de la maison</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {((a.rules as string[]) ?? []).map(r => (
                <span key={r} className="text-sm text-[#3E2C23]">
                  {r}
                </span>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Annulation</h2>
            <p className="font-semibold text-[#15803d] text-sm">{a.policy_name as string}</p>
            <p className="text-sm text-[#7a6355] mt-1 leading-relaxed">{a.policy_text as string}</p>
          </section>
        </div>

        <aside className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-24 flex flex-col gap-4">
          <div className={card}>
            <p className="font-display text-3xl font-bold text-[#3E2C23]">
              {formatUsd(nightly)}
              <span className="text-sm font-normal text-[#7a6355] ml-1">par nuit</span>
            </p>

            <StayDatesPicker value={dates} onChange={setDates} className="mt-4" />
            <GuestsPicker value={guests} onChange={setGuests} className="mt-2" />

            <div className="mt-5 flex flex-col gap-2 text-sm">
              <Row label={`${formatUsd(nightly)} × ${nights} ${unitWord("per_night", nights)}`} value={formatUsd(nightly * nights)} />
              {cleaning > 0 && <Row label="Ménage" value={formatUsd(cleaning)} />}
              {service > 0 && <Row label="Frais de service" value={formatUsd(service)} />}
              <div className="border-t border-[#e2d5c3] pt-2.5 mt-1 flex items-center justify-between">
                <span className="font-display font-bold text-[#3E2C23]">Total</span>
                <span className="font-display font-bold text-xl text-[#3E2C23]">{formatUsd(total)}</span>
              </div>
              <p className="text-xs text-[#7a6355]">≈ {formatHtg(total, rate)} au taux du jour</p>
            </div>

            {note && (
              // "Plus que deux" is a nudge; "complet" is a stop. They are not
              // the same message and do not get the same colour.
              <p
                className={`text-[13px] font-semibold mt-3 ${
                  note.tone === "stop" ? "text-[#b3261e]" : "text-[#c2410c]"
                }`}
              >
                {note.text}
              </p>
            )}

            <button onClick={book} disabled={soldOut} className={`${cta} mt-4 ${soldOut ? disabledCta : ""}`}>
              {soldOut ? "Indisponible à ces dates" : "Réserver"}
            </button>
            <p className="text-xs text-[#7a6355] text-center mt-2.5 leading-relaxed">
              {soldOut
                ? "Choisissez d'autres dates ou une autre chambre."
                : "Vous ne serez débité qu'après confirmation de l'hôte"}
            </p>
          </div>

          <div className="bg-[#D6F0FB] rounded-2xl p-5">
            <p className="font-display font-bold text-[#002089]">Ajouter à ce séjour</p>
            <p className="text-[13px] text-[#00508a] leading-relaxed mt-1.5">
              Une voiture avec retrait à l'aéroport, ou une table pour votre première soirée. Même panier, un seul
              paiement.
            </p>
            <button
              onClick={() => navigate("/search?kind=car")}
              className="mt-3 text-sm font-semibold text-[#002089] underline"
            >
              Parcourir
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── 1c — restaurant ────────────────────────────────────── */
/** Availability is computed in Port-au-Prince, so "aujourd'hui" has to be too. */
const todayInHaiti = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince" }).format(new Date());

/** "2026-09-15" -> "mardi 15 septembre" */
const frDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Why a date has nothing to offer. The RPC answers with a code rather than a
 * sentence, so the wording stays here and the database stays language-neutral.
 */
/** 120 -> "2 h", 90 -> "1 h 30", 45 -> "45 min" */
const frDelay = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
};

const CLOSED_REASON: Record<string, string> = {
  reservations_fermees: "Ce restaurant ne prend pas de réservation en ligne.",
  groupe_hors_limites: "Ce restaurant n'accepte pas un groupe de cette taille.",
  date_passee: "Choisissez une date à venir.",
  jour_meme_refuse: "Ce restaurant ne prend pas de réservation pour le jour même.",
  trop_loin: "Cette date est trop éloignée pour réserver.",
  aucune_table: "Ce restaurant n'a pas encore publié ses tables.",
  aucune_table_pour_ce_groupe: "Aucune table ne peut recevoir ce nombre de convives.",
  horaires_absents: "Ce restaurant n'a pas encore publié ses horaires.",
  ferme_ce_jour: "Fermé ce jour-là.",
  inconnu: "Ce restaurant n'est pas réservable en ligne.",
};

type Slot = { time: string; free: number; available: boolean };
type Availability = {
  open: boolean;
  reason?: string | null;
  slots: Slot[];
  duration_minutes?: number;
  min_party?: number;
  max_party?: number;
  min_notice_minutes?: number;
  max_advance_days?: number;
  grace_period_minutes?: number;
  deposit_required?: boolean;
  deposit_amount?: number | string | null;
  cancellation_deadline_hours?: number | null;
};

function RestaurantDetail({ listing, a, menu, privates, cart, navigate }: any) {
  const food = useFoodCart();
  const [tab, setTab] = useState<"table" | "private">("table");
  const [date, setDate] = useState<string>(todayInHaiti());
  const [slot, setSlot] = useState<string | null>(null);
  const [zone, setZone] = useState<string>(((a.zones as string[]) ?? ["Terrasse"])[0]);
  const [party, setParty] = useState(2);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);

  /**
   * Slots come from the restaurant's own opening hours, meal duration and free
   * tables, so they move with both the date and the party size. The previous
   * choice is dropped on every change: a créneau free for two is not
   * necessarily free for six.
   */
  useEffect(() => {
    let live = true;
    setLoadingSlots(true);
    setSlot(null);
    supabase
      .rpc("restaurant_availability", { p_listing: listing.id, p_date: date, p_party: party })
      .then(({ data, error }) => {
        if (!live) return;
        setAvail(
          error ? { open: false, reason: "inconnu", slots: [] } : (data as unknown as Availability),
        );
        setLoadingSlots(false);
      });
    return () => {
      live = false;
    };
  }, [listing.id, date, party]);

  const partyChoices = useMemo(() => {
    const lo = avail?.min_party ?? 1;
    const hi = Math.min(avail?.max_party ?? 12, 20);
    return Array.from({ length: Math.max(hi - lo + 1, 1) }, (_, i) => lo + i);
  }, [avail?.min_party, avail?.max_party]);

  // Ordering is a separate opt-in from taking reservations, so the menu only
  // becomes clickable when the restaurant actually runs a kitchen queue.
  const [ordering, setOrdering] = useState<{ on: boolean; min: number | null } | null>(null);
  useEffect(() => {
    let live = true;
    supabase
      .from("restaurant_settings")
      .select("accept_online_orders, order_min_total")
      .eq("listing_id", listing.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const s = data as { accept_online_orders: boolean; order_min_total: number | null } | null;
        setOrdering({ on: !!s?.accept_online_orders, min: s?.order_min_total ?? null });
      });
    return () => {
      live = false;
    };
  }, [listing.id]);

  const [switched, setSwitched] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);

  // Sizes and option groups, fetched once for the whole menu so opening a dish
  // costs nothing.
  const [sizes, setSizes] = useState<Variation[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [links, setLinks] = useState<{ item_id: string; group_id: string; position: number }[]>([]);

  useEffect(() => {
    const ids = (menu as MenuItem[]).map(m => m.id);
    if (ids.length === 0) return;
    let live = true;
    (async () => {
      const [v, lk, g, o] = await Promise.all([
        supabase.from("dish_variations").select("id, item_id, name, price, position")
          .in("item_id", ids).eq("active", true).order("position"),
        supabase.from("menu_item_modifier_groups").select("item_id, group_id, position")
          .in("item_id", ids).order("position"),
        supabase.from("modifier_groups").select("id, name, selection, required, min_select, max_select, position")
          .eq("listing_id", listing.id).eq("active", true).order("position"),
        supabase.from("modifiers").select("id, group_id, name, price_delta, kind, position")
          .eq("active", true).order("position"),
      ]);
      if (!live) return;
      setSizes((v.data ?? []) as Variation[]);
      setLinks((lk.data ?? []) as { item_id: string; group_id: string; position: number }[]);
      setGroups((g.data ?? []) as OptionGroup[]);
      setOptions((o.data ?? []) as Option[]);
    })();
    return () => {
      live = false;
    };
  }, [listing.id, menu]);

  const sizesOf = (itemId: string) => sizes.filter(v => v.item_id === itemId);
  const groupsOf = (itemId: string) => {
    const ids = links.filter(l => l.item_id === itemId).map(l => l.group_id);
    return groups.filter(g => ids.includes(g.id));
  };
  const needsChoosing = (m: MenuItem) => sizesOf(m.id).length > 0 || groupsOf(m.id).length > 0;

  // How many portions are left for today's service. A dish with no row is not
  // counted at all, which is not the same as "zero left".
  const [stock, setStock] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = (menu as MenuItem[]).map(m => m.id);
    if (ids.length === 0) return;
    let live = true;
    supabase
      .from("restaurant_inventory")
      .select("item_id, remaining")
      .in("item_id", ids)
      .eq("day", todayInHaiti())
      .then(({ data }) => {
        if (!live) return;
        const map: Record<string, number> = {};
        for (const r of (data ?? []) as { item_id: string; remaining: number }[]) {
          map[r.item_id] = r.remaining;
        }
        setStock(map);
      });
    return () => {
      live = false;
    };
  }, [menu]);

  // Combos and build-your-own plates, with their steps and choices.
  const [meals, setMeals] = useState<{
    templates: MealTemplate[];
    groups: MealGroup[];
    options: MealOption[];
    fixed: { template_id: string; name: string; quantity: number }[];
  }>({ templates: [], groups: [], options: [], fixed: [] });

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("meal_templates")
        .select(
          "id, kind, name, description, base_price, position, " +
            "meal_groups(id, template_id, name, required, min_select, max_select, position, " +
            "meal_group_options(id, group_id, price_delta, max_quantity, position, " +
            "food_components(name), menu_items(name))), " +
            "meal_fixed_items(quantity, menu_items(name))",
        )
        .eq("listing_id", listing.id)
        .eq("active", true)
        .order("position");
      if (!live) return;

      const templates: MealTemplate[] = [];
      const groups: MealGroup[] = [];
      const options: MealOption[] = [];
      const fixed: { template_id: string; name: string; quantity: number }[] = [];

      for (const t of (data ?? []) as any[]) {
        templates.push({
          id: t.id, kind: t.kind, name: t.name, description: t.description,
          base_price: t.base_price, position: t.position,
        });
        for (const f of t.meal_fixed_items ?? []) {
          fixed.push({ template_id: t.id, name: f.menu_items?.name ?? "—", quantity: f.quantity });
        }
        for (const g of t.meal_groups ?? []) {
          groups.push({
            id: g.id, template_id: t.id, name: g.name, required: g.required,
            min_select: g.min_select, max_select: g.max_select, position: g.position,
          });
          for (const o of g.meal_group_options ?? []) {
            options.push({
              id: o.id, group_id: g.id,
              label: o.food_components?.name ?? o.menu_items?.name ?? "—",
              price_delta: o.price_delta, max_quantity: o.max_quantity, position: o.position,
            });
          }
        }
      }
      groups.sort((a, b) => a.position - b.position);
      options.sort((a, b) => a.position - b.position);
      setMeals({ templates, groups, options, fixed });
    })();
    return () => {
      live = false;
    };
  }, [listing.id]);

  const left = (id: string): number | null => (id in stock ? stock[id] : null);
  const isOut = (m: MenuItem) => m.sold_out || left(m.id) === 0;

  const addToCart = (line: Parameters<typeof food.add>[1]) => {
    const outcome = food.add({ id: listing.id, name: listing.name }, line);
    if (outcome === "replaced") setSwitched(true);
    setConfiguring(null);
  };

  const addDish = (m: MenuItem) => {
    if (needsChoosing(m)) {
      setConfiguring(configuring === m.id ? null : m.id);
      return;
    }
    addToCart({
      item_id: m.id,
      name: m.name,
      unit_price: Number(m.discount_price ?? m.price),
      note: null,
      variation_id: null,
      variation_name: null,
      modifiers: [],
      template_id: null,
      selections: [],
      customizations: [],
    });
  };

  // Sections in the order the restaurant put them in, not the order dishes
  // happen to come back in.
  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of menu as MenuItem[]) {
      const c = m.menu_categories;
      if (c && !seen.has(c.name)) seen.set(c.name, c.position);
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  }, [menu]);
  const [cat, setCat] = useState<string | null>(null);
  const activeCat = cat ?? categories[0];

  const confirm = () => {
    if (!slot) return;
    cart.add({
      kind: "restaurant",
      listing_id: listing.id,
      title: listing.name,
      detail: `${frDate(date)}, ${slot} · ${party} convives · ${zone.toLowerCase()}`,
      amount: 0, // "Réservation — Gratuite"
      starts_on: date,
      start_time: `${slot}:00`,
      party,
    });
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <>
      <Gallery labels={["photo — salle", "plat", "terrasse", "bar"]} img={listing.img || undefined} alt={listing.name} />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-[#3E2C23]">{listing.name}</h1>
            <p className="text-sm text-[#7a6355] mt-1">{a.subtitle as string}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
              <span className="bg-[#002089] text-white font-display font-bold px-2.5 py-1 rounded-lg">
                {formatRating(listing)}
              </span>
              <span className="text-[#7a6355]">{listing.reviews} avis</span>
              <span className="font-semibold text-[#3E2C23]">{a.price_band as string}</span>
              <span className="text-[#15803d] font-medium">{a.hours as string}</span>
            </div>
          </div>

          <div className="flex gap-2">
            {(["table", "private"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  tab === t ? "bg-[#002089] text-white" : "bg-white border-2 border-[#e2d5c3] text-[#3E2C23]"
                }`}
              >
                {t === "table" ? "Réserver une table" : "Privatiser"}
              </button>
            ))}
          </div>

          {tab === "table" ? (
            <section className={card}>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                  <label
                    htmlFor="resa-date"
                    className="block text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold"
                  >
                    Date
                  </label>
                  <input
                    id="resa-date"
                    type="date"
                    value={date}
                    min={todayInHaiti()}
                    onChange={e => setDate(e.target.value)}
                    className="text-sm text-[#3E2C23] bg-transparent outline-none w-full"
                  />
                </div>
                <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                  <label
                    htmlFor="resa-party"
                    className="block text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold"
                  >
                    Convives
                  </label>
                  <select
                    id="resa-party"
                    value={party}
                    onChange={e => setParty(Number(e.target.value))}
                    className="text-sm text-[#3E2C23] bg-transparent outline-none w-full"
                  >
                    {partyChoices.map(n => (
                      <option key={n} value={n}>
                        {n} {n > 1 ? "personnes" : "personne"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                  <label
                    htmlFor="resa-zone"
                    className="block text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold"
                  >
                    Zone souhaitée
                  </label>
                  <select
                    id="resa-zone"
                    value={zone}
                    onChange={e => setZone(e.target.value)}
                    className="text-sm text-[#3E2C23] bg-transparent outline-none w-full"
                  >
                    {((a.zones as string[]) ?? []).map(z => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-xs uppercase tracking-wide text-[#7a6355] font-semibold mb-2.5">
                {avail?.duration_minutes
                  ? `Créneaux · table gardée ${avail.duration_minutes} min`
                  : "Créneaux"}
              </p>
              {loadingSlots ? (
                <p className="text-sm text-[#7a6355]">Recherche des tables libres…</p>
              ) : (avail?.slots.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(avail?.slots ?? []).map(s => (
                    <button
                      key={s.time}
                      onClick={() => setSlot(s.time)}
                      disabled={!s.available}
                      title={s.available ? `${s.free} table(s) libre(s)` : "Complet"}
                      aria-label={`${s.time} — ${s.available ? `${s.free} table(s) libre(s)` : "complet"}`}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        slot === s.time
                          ? "bg-[#002089] border-[#002089] text-white"
                          : s.available
                            ? "bg-white border-[#e2d5c3] text-[#002089] hover:border-[#002089]"
                            : "bg-[#f4efe6] border-[#e2d5c3] text-[#b0a090] line-through cursor-not-allowed"
                      }`}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#7a6355]">
                  {CLOSED_REASON[avail?.reason ?? "inconnu"] ?? CLOSED_REASON.inconnu}
                </p>
              )}
              {avail && (
                <p className="text-xs text-[#7a6355] mt-4 leading-relaxed">
                  {`Réservation jusqu'à ${frDelay(avail.min_notice_minutes ?? 0)} avant`}
                  {avail.max_advance_days ? `, et ${avail.max_advance_days} jours à l'avance` : ""}
                  {". "}
                  {avail.duration_minutes ? `Table gardée ${avail.duration_minutes} minutes` : ""}
                  {avail.grace_period_minutes
                    ? `, arrivée tolérée ${avail.grace_period_minutes} minutes après l'heure.`
                    : "."}
                </p>
              )}
            </section>
          ) : (
            <section className={card}>
              <h2 className={h2}>Privatisation</h2>
              <p className="text-sm text-[#7a6355] leading-relaxed mb-4">{a.private_note as string}</p>
              <div className="flex flex-col gap-3">
                {privates.map((p: PrivateOption) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-[#e2d5c3]"
                  >
                    <div>
                      <p className="font-display font-bold text-[#3E2C23]">{p.name}</p>
                      <p className="text-xs text-[#7a6355] mt-0.5">{p.capacity}</p>
                    </div>
                    <span className="text-sm font-display font-bold text-[#002089] shrink-0">{p.from_price}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={card}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`${h2} mb-0`}>Carte</h2>
              <span className="text-xs font-semibold text-[#002089] underline">Carte PDF</span>
            </div>
            <div className="flex gap-2 mb-4">
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeCat === c ? "bg-[#002089] text-white" : "bg-[#E9F9FE] text-[#3E2C23]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {menu
                .filter((m: MenuItem) => m.menu_categories?.name === activeCat)
                .map((m: MenuItem) => (
                  <div
                    key={m.id}
                    className={`flex flex-wrap items-start justify-between gap-4 ${isOut(m) ? "opacity-55" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#3E2C23] text-sm">
                        {m.name}
                        {isOut(m) && (
                          <Badge
                            label="Épuisé"
                            variant="warning"
                            appearance="subtle"
                            size="small"
                            animate={false}
                            className="ml-2"
                          />
                        )}
                        {m.dietary.map(d => (
                          <Badge
                            key={d}
                            label={d}
                            variant="primary"
                            appearance="subtle"
                            size="small"
                            animate={false}
                            className="ml-2"
                          />
                        ))}
                      </p>
                      {m.detail && <p className="text-xs text-[#7a6355] mt-0.5">{m.detail}</p>}
                      {!isOut(m) && left(m.id) !== null && (left(m.id) as number) <= 3 && (
                        <p className="text-[11px] font-semibold text-[#c9571a] mt-1">
                          Plus que {left(m.id)}
                        </p>
                      )}
                      {m.allergens.length > 0 && (
                        <p className="text-[11px] text-[#b0a090] mt-1">
                          Allergènes : {m.allergens.join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-[#3E2C23] shrink-0">
                      {m.discount_price !== null ? (
                        <>
                          <span className="mr-1.5 font-normal text-[#b0a090] line-through">
                            {formatUsd(Number(m.price))}
                          </span>
                          {formatUsd(Number(m.discount_price))}
                        </>
                      ) : m.price !== null ? (
                        formatUsd(Number(m.price))
                      ) : (
                        "Prix du marché"
                      )}
                    </span>

                    {ordering?.on && (
                      <button
                        onClick={() => addDish(m)}
                        aria-expanded={needsChoosing(m) ? configuring === m.id : undefined}
                        disabled={
                          isOut(m) ||
                          (sizesOf(m.id).length === 0 && m.price === null && m.discount_price === null)
                        }
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 border-[#002089] text-[#002089] hover:bg-[#002089] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#002089] transition-colors"
                      >
                        {isOut(m) ? "Épuisé" : needsChoosing(m) ? "Choisir" : "Ajouter"}
                      </button>
                    )}

                    {ordering?.on && configuring === m.id && (
                      <DishConfigurator
                        dish={m}
                        sizes={sizesOf(m.id)}
                        groups={groupsOf(m.id)}
                        options={options}
                        onCancel={() => setConfiguring(null)}
                        onAdd={addToCart}
                      />
                    )}
                  </div>
                ))}
            </div>

            {ordering?.on && food.listingId === listing.id && food.count > 0 && (
              <div className="mt-5 border-t border-[#e2d5c3] pt-4 flex flex-wrap items-center gap-3">
                <span className="text-sm text-[#3E2C23] flex-1 min-w-0">
                  <strong className="font-bold">
                    {food.count} article{food.count > 1 ? "s" : ""}
                  </strong>{" "}
                  · {formatUsd(food.subtotal)}
                  {ordering.min !== null && food.subtotal < Number(ordering.min) && (
                    <span className="block text-xs text-[#b3261e]">
                      Minimum {formatUsd(Number(ordering.min))} pour commander.
                    </span>
                  )}
                </span>
                <button
                  onClick={() => navigate(`/commander/${listing.id}`)}
                  className="bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Commander
                </button>
              </div>
            )}

            {switched && (
              <p className="mt-3 text-xs text-[#00508a] bg-[#D6F0FB] rounded-xl px-3 py-2.5">
                Votre panier contenait des plats d'un autre restaurant : une commande ne peut
                venir que d'un seul. Il a été remplacé.
              </p>
            )}
          </section>

          {ordering?.on && meals.templates.length > 0 && (
            <section className={card}>
              <h2 className={h2}>Formules et assiettes</h2>
              <div className="flex flex-col gap-3">
                {meals.templates.map(t => (
                  <MealBuilder
                    key={t.id}
                    template={t}
                    groups={meals.groups.filter(g => g.template_id === t.id)}
                    options={meals.options}
                    fixed={meals.fixed.filter(f => f.template_id === t.id)}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-24">
          <div className={card}>
            <p className="font-display font-bold text-[#3E2C23]">
              {frDate(date)}
              {slot ? `, ${slot}` : ""}
            </p>
            <p className="text-sm text-[#7a6355] mt-0.5">
              {party} convives · {zone.toLowerCase()}
            </p>

            <div className="mt-5 flex flex-col gap-2 text-sm">
              <Row label="Réservation" value="Gratuite" />
              <Row
                label="Acompte"
                value={
                  avail?.deposit_required && avail.deposit_amount
                    ? `${formatUsd(Number(avail.deposit_amount))} / personne`
                    : "Aucun"
                }
              />
              <Row
                label="Annulation"
                value={
                  avail?.cancellation_deadline_hours
                    ? `Jusqu'à ${avail.cancellation_deadline_hours} h avant`
                    : "Non précisée"
                }
              />
            </div>

            {tab === "table" ? (
              <button onClick={confirm} disabled={!slot} className={`${cta} mt-5 disabled:opacity-50`}>
                {slot ? "Confirmer la table" : "Choisissez un créneau"}
              </button>
            ) : (
              <button className={`${cta} mt-5`}>Demander une privatisation</button>
            )}

            {cart.items.some((i: any) => i.kind === "stay") && (
              <p className="text-xs text-[#00508a] bg-[#D6F0FB] rounded-xl p-3 mt-3 leading-relaxed">
                Vous avez déjà un séjour dans votre panier. Cette table s'ajoute au même paiement.
              </p>
            )}
          </div>
        </aside>
      </div>

      <Offers
        listing={listing}
        cart={cart}
        navigate={navigate}
        booking={{
          units: 1,
          starts_on: date,
          start_time: slot ? `${slot}:00` : null,
          party,
          ready: !!slot,
          hint: "Choisissez un créneau",
        }}
      />
    </>
  );
}

/* ── 1d — voiture ───────────────────────────────────────── */
function CarDetail({ listing, a, rate, cart, navigate, dates, setDates }: any) {
  const pickups: Pickup[] = (a.pickups as Pickup[]) ?? [];
  const [pickupIdx, setPickupIdx] = useState(0);
  const [withDriver, setWithDriver] = useState(false);

  // A vehicle is one vehicle: the annonce is the inventory, and there is no
  // room type to choose between.
  const { availability } = useStayAvailability(listing.id, null, dates.checkin, dates.checkout);
  const note = availabilityNote(availability);
  const soldOut = availability !== null && !availability.available;

  const days = nightsBetween(dates.checkin, dates.checkout);
  const base = Number(listing.price) * days;
  const driver = withDriver ? Number(a.driver_per_day ?? 0) * days : 0;
  const delivery = Number(pickups[pickupIdx]?.fee ?? 0);
  const total = base + driver + delivery;

  const book = () => {
    cart.add({
      kind: "car",
      listing_id: listing.id,
      title: listing.name,
      detail: `${formatDateRange(dates.checkin, dates.checkout)} · ${pickups[pickupIdx]?.name ?? "retrait"} 09:00`,
      amount: total,
      starts_on: dates.checkin,
      ends_on: dates.checkout,
      start_time: "09:00:00",
    });
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <>
      <Gallery labels={["photo — véhicule", "intérieur", "coffre", "tableau de bord"]} img={listing.img || undefined} alt={listing.name} />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge label={(a.body as string) ?? listing.type} variant="primary" size="small" />
              <Badge label={a.insurance_badge as string} variant="success" appearance="subtle" size="small" />
            </div>
            <h1 className="font-display text-3xl font-bold text-[#3E2C23]">{listing.name}</h1>
            <p className="text-sm text-[#7a6355] mt-1">{a.subtitle as string}</p>
          </div>

          <section className={card}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {((a.specs as KV[]) ?? []).map(s => (
                <div key={s.k}>
                  <p className="text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold">{s.k}</p>
                  <p className="text-sm font-semibold text-[#3E2C23] mt-0.5">{s.v}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Conditions du loueur</h2>
            <div className="flex flex-col gap-3">
              {((a.terms as KV[]) ?? []).map(t => (
                <div key={t.k} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-[#7a6355] shrink-0">{t.k}</span>
                  <span className="text-[#3E2C23] font-medium text-right">{t.v}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Retrait et retour</h2>
            <div className="flex flex-col gap-3">
              {pickups.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => setPickupIdx(i)}
                  className={`flex items-center justify-between gap-4 text-left p-4 rounded-xl border-2 transition-colors ${
                    pickupIdx === i ? "border-[#002089] bg-[#D6F0FB]" : "border-[#e2d5c3] hover:border-[#002089]"
                  }`}
                >
                  <div>
                    <p className="font-display font-bold text-[#3E2C23]">{p.name}</p>
                    <p className="text-xs text-[#7a6355] mt-0.5">{p.detail}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#002089] shrink-0">
                    {p.fee > 0 ? formatUsd(p.fee) : "Gratuit"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-24">
          <div className={card}>
            <p className="font-display text-3xl font-bold text-[#3E2C23]">
              {formatUsd(Number(listing.price))}
              <span className="text-sm font-normal text-[#7a6355] ml-1">par jour</span>
            </p>

            <StayDatesPicker
              value={dates}
              onChange={setDates}
              labels={["Retrait", "Retour"]}
              className="mt-4"
            />
            <p className="text-xs text-[#7a6355] mt-1.5">Retrait et retour à 09:00</p>

            <label className="flex items-center justify-between gap-3 mt-3 p-3 rounded-xl border-2 border-[#e2d5c3] cursor-pointer">
              <span className="text-sm text-[#3E2C23]">
                Avec chauffeur
                <span className="block text-xs text-[#7a6355]">+ {a.driver_per_day} $ par jour</span>
              </span>
              <input
                type="checkbox"
                checked={withDriver}
                onChange={e => setWithDriver(e.target.checked)}
                className="w-[18px] h-[18px] rounded accent-[#002089]"
              />
            </label>

            <div className="mt-5 flex flex-col gap-2 text-sm">
              <Row label={`${formatUsd(Number(listing.price))} × ${days} ${unitWord("per_day", days)}`} value={formatUsd(base)} />
              {withDriver && <Row label="Chauffeur" value={formatUsd(driver)} />}
              <Row
                label={pickups[pickupIdx]?.name ?? "Retrait"}
                value={delivery > 0 ? formatUsd(delivery) : formatUsd(0)}
              />
              <div className="border-t border-[#e2d5c3] pt-2.5 mt-1 flex items-center justify-between">
                <span className="font-display font-bold text-[#3E2C23]">Total</span>
                <span className="font-display font-bold text-xl text-[#3E2C23]">{formatUsd(total)}</span>
              </div>
              <p className="text-xs text-[#7a6355]">≈ {formatHtg(total, rate)}</p>
            </div>

            {note && (
              <p
                className={`text-[13px] font-semibold mt-3 ${
                  note.tone === "stop" ? "text-[#b3261e]" : "text-[#c2410c]"
                }`}
              >
                {note.text}
              </p>
            )}

            <button onClick={book} disabled={soldOut} className={`${cta} mt-4 ${soldOut ? disabledCta : ""}`}>
              {soldOut ? "Indisponible à ces dates" : "Réserver"}
            </button>
            <p className="text-xs text-[#7a6355] text-center mt-2.5 leading-relaxed">
              {soldOut
                ? "Ce véhicule est déjà loué sur cette période."
                : `Caution de ${a.deposit} $ préautorisée, non débitée`}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── Offres ─────────────────────────────────────────────── */

type PackageRow = Tables<"partner_packages"> & { package_lines: Tables<"package_lines">[] };

type OfferQuote = {
  price: number;
  reference: number | null;
  savings: number | null;
  savings_known: boolean;
};

/**
 * What the visitor has to have chosen before an offer can be booked. A stay and
 * a rental already know their dates; a restaurant does not know its table until
 * a créneau is picked, which is why its section is rendered from inside
 * RestaurantDetail rather than beside it.
 */
type OfferBooking = {
  units: number;
  starts_on: string;
  ends_on?: string | null;
  start_time?: string | null;
  party?: number | null;
  ready: boolean;
  hint?: string;
};

const unitWord = (basis: string, n: number) =>
  basis === "per_day" ? (n > 1 ? "jours" : "jour") : n > 1 ? "nuits" : "nuit";

/**
 * A package is several things the partner already sells, under one name and one
 * price. The saving is never computed here: `package_quote` reads each bound
 * line's price in the database and answers, and this only displays what came
 * back — including the refusal to name a saving when a line has no value.
 */
function Offers({
  listing,
  cart,
  navigate,
  booking,
}: {
  listing: ListingRow;
  cart: { add: (item: CartItem) => void };
  navigate: (to: string) => void;
  booking: OfferBooking;
}) {
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [quotes, setQuotes] = useState<Record<string, OfferQuote>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase
        .from("partner_packages")
        .select("*, package_lines(*)")
        .eq("listing_id", listing.id)
        .eq("active", true)
        .order("position");
      if (!live) return;
      if (error) {
        console.error("Failed to load offers:", error);
        return;
      }
      const list = (data ?? []) as unknown as PackageRow[];
      setRows(list);

      const answers = await Promise.all(
        list.map(p => supabase.rpc("package_quote", { p_package: p.id, p_units: booking.units })),
      );
      if (!live) return;
      const next: Record<string, OfferQuote> = {};
      list.forEach((p, i) => {
        const q = answers[i].data as unknown as OfferQuote | null;
        if (q) next[p.id] = q;
      });
      setQuotes(next);
    })();
    return () => {
      live = false;
    };
  }, [listing.id, booking.units]);

  if (rows.length === 0) return null;

  const book = (p: PackageRow) => {
    cart.add({
      kind: listing.kind as CartItem["kind"],
      listing_id: listing.id,
      title: p.name,
      detail: p.package_lines
        .map(l => l.label + (l.quantity > 1 ? ` ×${l.quantity}` : ""))
        .join(", "),
      // The database prices this again and ignores the figure below; it is here
      // so the checkout summary has something to show on the way.
      amount: Number(quotes[p.id]?.price ?? p.price),
      package_id: p.id,
      starts_on: booking.starts_on,
      ends_on: booking.ends_on ?? null,
      start_time: booking.start_time ?? null,
      party: booking.party ?? null,
    });
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold text-[#3E2C23]">Offres</h2>
      <p className="text-sm text-[#7a6355] mt-1 mb-4">
        Plusieurs prestations réunies sous un prix unique.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(p => {
          const q = quotes[p.id];
          const savings =
            q?.savings_known && q.savings !== null && Number(q.savings) > 0 ? Number(q.savings) : null;
          const tooShort = p.min_units !== null && booking.units < p.min_units;
          const left = p.usage_limit === null ? null : Math.max(p.usage_limit - p.used_count, 0);
          const blocked = !booking.ready || tooShort || left === 0;

          return (
            <article
              key={p.id}
              className="bg-white rounded-2xl border border-[#e2d5c3] p-5 flex flex-col gap-3"
            >
              <div>
                <h3 className="font-display text-lg font-bold text-[#3E2C23] leading-tight">{p.name}</h3>
                {p.description && <p className="text-sm text-[#7a6355] mt-1">{p.description}</p>}
              </div>

              {p.package_lines.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-[#3E2C23]">
                  {p.package_lines.map(l => (
                    <li key={l.id} className="flex gap-2">
                      <span className="text-[#002089] font-bold" aria-hidden>·</span>
                      <span>
                        {l.label}
                        {l.quantity > 1 && <span className="text-[#7a6355]"> ×{l.quantity}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto pt-3 border-t border-[#e2d5c3]">
                <p className="font-display text-2xl font-bold text-[#3E2C23]">
                  {formatUsd(Number(q?.price ?? p.price))}
                  <span className="text-sm font-normal text-[#7a6355] ml-1">
                    {p.basis === "total"
                      ? "pour le tout"
                      : `total · ${booking.units} ${unitWord(p.basis, booking.units)}`}
                  </span>
                </p>

                {/* Shown only when it is known and positive. A partner who has
                    priced an offer above its parts does not get a "saving"
                    printed for them, and a line without a value means there is
                    no figure to print at all. */}
                {savings !== null && (
                  <p className="text-sm font-semibold text-[#15803d] mt-0.5">
                    Vous économisez {formatUsd(savings)}
                  </p>
                )}

                {left !== null && left > 0 && (
                  <p className="text-xs text-[#7a6355] mt-0.5">
                    Plus que {left} {left > 1 ? "disponibles" : "disponible"}
                  </p>
                )}
              </div>

              <button
                onClick={() => book(p)}
                disabled={blocked}
                className="bg-[#e76f2e] hover:bg-[#d05e20] disabled:bg-[#e2d5c3] disabled:text-[#7a6355] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                {left === 0
                  ? "Offre épuisée"
                  : tooShort
                    ? `Au moins ${p.min_units} ${unitWord(p.basis, p.min_units ?? 2)}`
                    : booking.ready
                      ? "Réserver cette offre"
                      : (booking.hint ?? "Indisponible")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#7a6355]">{label}</span>
      <span className="text-[#3E2C23] font-medium">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
      <p className="text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold">{label}</p>
      <p className="text-sm text-[#3E2C23]">{value}</p>
    </div>
  );
}

/**
 * Choosing a portion and answering the restaurant's questions before the dish
 * reaches the cart. The running total is shown on the button, because the
 * specification's rule is that the price is never a surprise.
 *
 * Nothing here is trusted: `place_food_order` reprices the whole line from the
 * menu. This exists so the customer sees the same number the kitchen will.
 */
function DishConfigurator({
  dish,
  sizes,
  groups,
  options,
  onCancel,
  onAdd,
}: {
  dish: MenuItem;
  sizes: Variation[];
  groups: OptionGroup[];
  options: Option[];
  onCancel: () => void;
  onAdd: (line: {
    item_id: string;
    name: string;
    unit_price: number;
    note: string | null;
    variation_id: string | null;
    variation_name: string | null;
    modifiers: { id: string; name: string; price_delta: number; quantity: number }[];
    template_id: null;
    selections: never[];
    customizations: { kind: "allergy" | "note"; label: string }[];
  }) => void;
}) {
  const [size, setSize] = useState<string | null>(sizes[0]?.id ?? null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");

  const optionsOf = (groupId: string) => options.filter(o => o.group_id === groupId);
  const pickedIn = (groupId: string) => picked[groupId] ?? [];

  const toggle = (g: OptionGroup, optionId: string) =>
    setPicked(prev => {
      const now = prev[g.id] ?? [];
      if (now.includes(optionId)) return { ...prev, [g.id]: now.filter(x => x !== optionId) };
      // A single-choice question replaces rather than stacks.
      if (g.max_select <= 1) return { ...prev, [g.id]: [optionId] };
      if (now.length >= g.max_select) return prev;
      return { ...prev, [g.id]: [...now, optionId] };
    });

  const chosen = Object.values(picked).flat();
  const chosenOptions = options.filter(o => chosen.includes(o.id));
  const base = size
    ? Number(sizes.find(v => v.id === size)?.price ?? 0)
    : Number(dish.discount_price ?? dish.price ?? 0);
  const unit = base + chosenOptions.reduce((s, o) => s + Number(o.price_delta), 0);

  const missing = groups.filter(g => pickedIn(g.id).length < g.min_select);

  const submit = () => {
    const variation = sizes.find(v => v.id === size) ?? null;
    onAdd({
      item_id: dish.id,
      name: dish.name + (variation ? ` (${variation.name})` : ""),
      unit_price: unit,
      note: note.trim() || null,
      variation_id: variation?.id ?? null,
      variation_name: variation?.name ?? null,
      modifiers: chosenOptions.map(o => ({
        id: o.id,
        name: o.name,
        price_delta: Number(o.price_delta),
        quantity: 1,
      })),
      template_id: null,
      selections: [],
      customizations: [],
    });
  };

  return (
    <div className="w-full mt-3 rounded-xl border-2 border-[#e2d5c3] bg-[#FBF8F3] p-4">
      {sizes.length > 0 && (
        <fieldset className="mb-4">
          <legend className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-2">
            Portion
          </legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map(v => (
              <button
                key={v.id}
                type="button"
                aria-pressed={size === v.id}
                onClick={() => setSize(v.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                  size === v.id
                    ? "bg-[#002089] border-[#002089] text-white"
                    : "bg-white border-[#e2d5c3] text-[#3E2C23] hover:border-[#002089]"
                }`}
              >
                {v.name} · {formatUsd(Number(v.price))}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {groups.map(g => (
        <fieldset key={g.id} className="mb-4">
          <legend className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-2">
            {g.name}
            <span className="ml-1.5 normal-case tracking-normal text-[#b0a090]">
              {g.required ? "obligatoire" : "facultatif"}
              {g.max_select > 1 ? ` · jusqu'à ${g.max_select}` : ""}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {optionsOf(g.id).map(o => {
              const on = pickedIn(g.id).includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(g, o.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                    on
                      ? "bg-[#002089] border-[#002089] text-white"
                      : "bg-white border-[#e2d5c3] text-[#3E2C23] hover:border-[#002089]"
                  }`}
                >
                  {o.name}
                  {Number(o.price_delta) !== 0 && (
                    <span className="ml-1.5 tabular-nums">
                      {Number(o.price_delta) > 0 ? "+" : "−"}
                      {formatUsd(Math.abs(Number(o.price_delta)))}
                    </span>
                  )}
                </button>
              );
            })}
            {optionsOf(g.id).length === 0 && (
              <span className="text-xs text-[#b0a090]">Aucune option disponible.</span>
            )}
          </div>
        </fieldset>
      ))}

      <label htmlFor={`cfg-note-${dish.id}`} className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold">
        Instructions
      </label>
      <input
        id={`cfg-note-${dish.id}`}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Sauce à part, bien cuit…"
        className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e2d5c3] text-xs text-[#3E2C23] outline-none focus:border-[#002089]"
      />

      {missing.length > 0 && (
        <p className="mt-3 text-xs text-[#b3261e]">
          À choisir : {missing.map(g => g.name).join(", ")}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={missing.length > 0}
          className="flex-1 min-w-40 bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Ajouter — {formatUsd(unit)}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-[#e2d5c3] text-[#7a6355] hover:border-[#002089] hover:text-[#002089] transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

/**
 * A combo or a built plate. The steps, their rules and their prices all come
 * from the restaurant; the running total sits on the button so the plate is
 * never a surprise. `place_food_order` reprices the whole line regardless.
 */
function MealBuilder({
  template,
  groups,
  options,
  fixed,
  onAdd,
}: {
  template: MealTemplate;
  groups: MealGroup[];
  options: MealOption[];
  fixed: { name: string; quantity: number }[];
  onAdd: (line: {
    item_id: null;
    template_id: string;
    name: string;
    unit_price: number;
    note: string | null;
    variation_id: null;
    variation_name: null;
    modifiers: never[];
    selections: { option_id: string; name: string; price_delta: number; quantity: number }[];
    customizations: { kind: "allergy" | "note"; label: string }[];
  }) => void;
}) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const optionsOf = (groupId: string) => options.filter(o => o.group_id === groupId);
  const qtyOf = (optionId: string) => picked[optionId] ?? 0;
  const takenIn = (g: MealGroup) =>
    optionsOf(g.id).reduce((n, o) => n + qtyOf(o.id), 0);

  const bump = (g: MealGroup, o: MealOption, delta: number) =>
    setPicked(prev => {
      const now = prev[o.id] ?? 0;
      const next = Math.max(0, now + delta);
      if (delta > 0) {
        if (o.max_quantity !== null && next > o.max_quantity) return prev;
        // A single-choice step swaps rather than stacks.
        if (g.max_select <= 1) {
          const cleared = { ...prev };
          for (const other of optionsOf(g.id)) delete cleared[other.id];
          return { ...cleared, [o.id]: 1 };
        }
        if (takenIn(g) + delta > g.max_select) return prev;
      }
      const out = { ...prev, [o.id]: next };
      if (next === 0) delete out[o.id];
      return out;
    });

  const chosen = options.filter(o => qtyOf(o.id) > 0);
  const unit =
    Number(template.base_price) +
    chosen.reduce((s, o) => s + Number(o.price_delta) * qtyOf(o.id), 0);

  const missing = groups.filter(g => takenIn(g) < g.min_select);

  const submit = () => {
    onAdd({
      item_id: null,
      template_id: template.id,
      name: template.name,
      unit_price: unit,
      note: note.trim() || null,
      variation_id: null,
      variation_name: null,
      modifiers: [],
      selections: chosen.map(o => ({
        option_id: o.id,
        name: o.label,
        price_delta: Number(o.price_delta),
        quantity: qtyOf(o.id),
      })),
      customizations: [],
    });
    setPicked({});
    setNote("");
    setOpen(false);
  };

  return (
    <div className="rounded-2xl border-2 border-[#e2d5c3] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-[#3E2C23]">{template.name}</p>
          {template.description && (
            <p className="text-sm text-[#7a6355] mt-0.5">{template.description}</p>
          )}
          {fixed.length > 0 && (
            <p className="text-xs text-[#7a6355] mt-1.5">
              Comprend : {fixed.map(f => `${f.quantity} × ${f.name}`).join(", ")}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-lg font-bold text-[#3E2C23]">
            {Number(template.base_price) > 0 ? formatUsd(Number(template.base_price)) : "—"}
          </p>
          <p className="text-[11px] text-[#7a6355]">
            {template.kind === "combo" ? "formule" : "à composer"}
          </p>
        </div>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 w-full bg-[#002089] hover:bg-[#001560] text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
        >
          {template.kind === "combo" ? "Choisir la formule" : "Composer mon assiette"}
        </button>
      ) : (
        <div className="mt-4">
          {groups.map((g, i) => (
            <fieldset key={g.id} className="mb-4">
              <legend className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-2">
                {i + 1}. {g.name}
                <span className="ml-1.5 normal-case tracking-normal text-[#b0a090]">
                  {g.required ? `obligatoire · ${g.min_select} min` : "facultatif"}
                  {g.max_select > 1 ? ` · ${g.max_select} max` : ""}
                </span>
              </legend>
              <div className="flex flex-col gap-1.5">
                {optionsOf(g.id).map(o => {
                  const n = qtyOf(o.id);
                  return (
                    <div
                      key={o.id}
                      className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 transition-colors ${
                        n > 0 ? "border-[#002089] bg-[#f4f8fd]" : "border-[#e2d5c3]"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-label={`Retirer ${o.label}`}
                          disabled={n === 0}
                          onClick={() => bump(g, o, -1)}
                          className="w-7 h-7 rounded-lg border-2 border-[#e2d5c3] text-[#3E2C23] font-bold disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-semibold tabular-nums">{n}</span>
                        <button
                          type="button"
                          aria-label={`Ajouter ${o.label}`}
                          onClick={() => bump(g, o, 1)}
                          className="w-7 h-7 rounded-lg border-2 border-[#e2d5c3] text-[#3E2C23] font-bold"
                        >
                          +
                        </button>
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-[#3E2C23]">{o.label}</span>
                      {Number(o.price_delta) !== 0 && (
                        <span className="text-sm font-semibold text-[#3E2C23] shrink-0 tabular-nums">
                          {Number(o.price_delta) > 0 ? "+" : "−"}
                          {formatUsd(Math.abs(Number(o.price_delta)))}
                        </span>
                      )}
                    </div>
                  );
                })}
                {optionsOf(g.id).length === 0 && (
                  <span className="text-xs text-[#b0a090]">Aucun choix disponible.</span>
                )}
              </div>
            </fieldset>
          ))}

          <label htmlFor={`meal-note-${template.id}`} className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold">
            Instructions
          </label>
          <input
            id={`meal-note-${template.id}`}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Sauce à part, sans sel…"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e2d5c3] text-xs text-[#3E2C23] outline-none focus:border-[#002089]"
          />

          {missing.length > 0 && (
            <p className="mt-3 text-xs text-[#b3261e]">
              À compléter : {missing.map(g => g.name).join(", ")}.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={missing.length > 0}
              className="flex-1 min-w-40 bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              Ajouter — {formatUsd(unit)}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-[#e2d5c3] text-[#7a6355] hover:border-[#002089] hover:text-[#002089] transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
