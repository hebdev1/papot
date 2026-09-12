import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Badge } from "../components/ui/cvui-badge";
import { supabase } from "../lib/supabase";
import { formatHtg, formatUsd, useUsdHtgRate } from "../lib/currency";
import { attrsOf, formatRating, type ListingRow } from "../lib/listings";
import { formatDateRange, nightsBetween, useCart } from "../lib/cart";
import type { Tables } from "../types/database";

type Unit = Tables<"listing_units">;
type MenuItem = Tables<"menu_items">;
type PrivateOption = Tables<"private_options">;
type KV = { k: string; v: string };
type Pickup = { name: string; detail: string; fee: number };

const CHECKIN = "2026-10-12";
const CHECKOUT = "2026-10-16";

const card = "bg-white rounded-2xl border border-[#e2d5c3] p-6";
const h2 = "font-display text-xl font-bold text-[#002089] mb-4";
const cta =
  "w-full py-3.5 rounded-xl bg-[#e76f2e] hover:bg-[#d05e20] text-white font-display font-bold text-[15px] shadow-[0_6px_18px_rgba(231,111,46,.3)] transition-colors";

/** Main tile uses the listing photo when there is one; the rest stay
    placeholders, since the canvas marks the extra shots as "à fournir". */
function Gallery({ labels, more, img, alt }: { labels: string[]; more?: number; img?: string; alt?: string }) {
  return (
    <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[300px] mb-7">
      <div className="col-span-2 row-span-2 bg-[#EAF8FF] rounded-2xl overflow-hidden flex items-center justify-center text-sm text-[#00508a]">
        {img ? (
          <img src={img} alt={alt ?? ""} className="w-full h-full object-cover" />
        ) : (
          labels[0]
        )}
      </div>
      {labels.slice(1, 4).map(l => (
        <div key={l} className="bg-[#EAF8FF] rounded-2xl flex items-center justify-center text-xs text-[#00508a]">
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
        supabase.from("menu_items").select("*").eq("listing_id", id).order("position"),
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

  if (loading) return <main className="max-w-7xl mx-auto px-4 py-20 text-[#7a6355]">Chargement…</main>;
  if (!listing)
    return (
      <main className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-[#002089]">Établissement introuvable</h1>
        <button onClick={() => navigate("/")} className="mt-4 text-[#002089] font-semibold underline">
          Retour à l'accueil
        </button>
      </main>
    );

  const a = attrsOf(listing) as ReturnType<typeof attrsOf> & Record<string, unknown>;

  return (
    <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
      <p className="text-sm text-[#7a6355] mb-4">{(a.breadcrumb as string) ?? listing.location}</p>

      {listing.kind === "stay" && (
        <StayDetail listing={listing} a={a} units={units} rate={rate} cart={cart} navigate={navigate} />
      )}
      {listing.kind === "restaurant" && (
        <RestaurantDetail listing={listing} a={a} menu={menu} privates={privates} cart={cart} navigate={navigate} />
      )}
      {listing.kind === "car" && (
        <CarDetail listing={listing} a={a} rate={rate} cart={cart} navigate={navigate} />
      )}
    </main>
  );
}

/* ── 1b — hébergement ───────────────────────────────────── */
function StayDetail({ listing, a, units, rate, cart, navigate }: any) {
  const [unitId, setUnitId] = useState<string | null>(null);
  const available = units.filter((u: Unit) => u.available);
  const selected: Unit | undefined = available.find((u: Unit) => u.id === unitId) ?? available[0];

  const nights = nightsBetween(CHECKIN, CHECKOUT);
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
      detail: `${formatDateRange(CHECKIN, CHECKOUT)} · ${nights} nuits · 2 adultes`,
      amount: total,
      starts_on: CHECKIN,
      ends_on: CHECKOUT,
      party: 2,
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
                return (
                  <button
                    key={u.id}
                    disabled={!u.available}
                    onClick={() => setUnitId(u.id)}
                    className={`flex items-center justify-between gap-4 text-left p-4 rounded-xl border-2 transition-colors ${
                      !u.available
                        ? "border-[#e2d5c3] opacity-60 cursor-not-allowed"
                        : on
                          ? "border-[#002089] bg-[#EAF8FF]"
                          : "border-[#e2d5c3] hover:border-[#002089]"
                    }`}
                  >
                    <div>
                      <p className="font-display font-bold text-[#3E2C23]">{u.name}</p>
                      <p className="text-xs text-[#7a6355] mt-0.5">{u.detail}</p>
                    </div>
                    <span className="text-sm font-display font-bold text-[#002089] shrink-0">
                      {u.available ? `${formatUsd(Number(u.price))} / nuit` : "Indisponible ces dates"}
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

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                <p className="text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold">Arrivée</p>
                <p className="text-sm text-[#3E2C23]">12 oct.</p>
              </div>
              <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                <p className="text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold">Départ</p>
                <p className="text-sm text-[#3E2C23]">16 oct.</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 mt-2 rounded-xl border-2 border-[#e2d5c3]">
              <span className="text-sm text-[#3E2C23]">2 adultes · 0 enfant</span>
              <span className="text-xs font-semibold text-[#002089]">Modifier</span>
            </div>

            <div className="mt-5 flex flex-col gap-2 text-sm">
              <Row label={`${formatUsd(nightly)} × ${nights} nuits`} value={formatUsd(nightly * nights)} />
              {cleaning > 0 && <Row label="Ménage" value={formatUsd(cleaning)} />}
              {service > 0 && <Row label="Frais de service" value={formatUsd(service)} />}
              <div className="border-t border-[#e2d5c3] pt-2.5 mt-1 flex items-center justify-between">
                <span className="font-display font-bold text-[#3E2C23]">Total</span>
                <span className="font-display font-bold text-xl text-[#3E2C23]">{formatUsd(total)}</span>
              </div>
              <p className="text-xs text-[#7a6355]">≈ {formatHtg(total, rate)} au taux du jour</p>
            </div>

            <button onClick={book} className={`${cta} mt-4`}>
              Réserver
            </button>
            <p className="text-xs text-[#7a6355] text-center mt-2.5 leading-relaxed">
              Vous ne serez débité qu'après confirmation de l'hôte
            </p>
          </div>

          <div className="bg-[#EAF8FF] rounded-2xl p-5">
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
function RestaurantDetail({ listing, a, menu, privates, cart, navigate }: any) {
  const [tab, setTab] = useState<"table" | "private">("table");
  const [slot, setSlot] = useState<string | null>(null);
  const [zone, setZone] = useState<string>(((a.zones as string[]) ?? ["Terrasse"])[0]);
  const [party, setParty] = useState(4);

  const categories = useMemo(
    () => Array.from(new Set(menu.map((m: MenuItem) => m.category))) as string[],
    [menu],
  );
  const [cat, setCat] = useState<string | null>(null);
  const activeCat = cat ?? categories[0];

  const confirm = () => {
    cart.add({
      kind: "restaurant",
      listing_id: listing.id,
      title: listing.name,
      detail: `12 oct., ${slot} · ${party} convives · ${zone.toLowerCase()}`,
      amount: 0, // "Réservation — Gratuite"
      starts_on: CHECKIN,
      start_time: slot ? `${slot}:00` : null,
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
                <Field label="Date" value="Lundi 12 oct." />
                <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                  <p className="text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold">Convives</p>
                  <select
                    value={party}
                    onChange={e => setParty(Number(e.target.value))}
                    className="text-sm text-[#3E2C23] bg-transparent outline-none w-full"
                  >
                    {[2, 3, 4, 5, 6, 8].map(n => (
                      <option key={n} value={n}>
                        {n} personnes
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3 rounded-xl border-2 border-[#e2d5c3]">
                  <p className="text-[10px] uppercase tracking-wide text-[#7a6355] font-semibold">Zone</p>
                  <select
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
                {a.service_label as string}
              </p>
              <div className="flex flex-wrap gap-2">
                {((a.all_slots as string[]) ?? []).map(s => (
                  <button
                    key={s}
                    onClick={() => setSlot(s)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      slot === s
                        ? "bg-[#002089] border-[#002089] text-white"
                        : "bg-white border-[#e2d5c3] text-[#002089] hover:border-[#002089]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#7a6355] mt-4 leading-relaxed">{a.booking_note as string}</p>
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
                    activeCat === c ? "bg-[#002089] text-white" : "bg-[#F5E9D8] text-[#3E2C23]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {menu
                .filter((m: MenuItem) => m.category === activeCat)
                .map((m: MenuItem) => (
                  <div key={m.id} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#3E2C23] text-sm">
                        {m.name}
                        {m.tag && (
                          <Badge label={m.tag} variant="primary" appearance="subtle" size="small"
                                 animate={false} className="ml-2" />
                        )}
                      </p>
                      <p className="text-xs text-[#7a6355] mt-0.5">{m.detail}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#3E2C23] shrink-0">{formatUsd(Number(m.price))}</span>
                  </div>
                ))}
            </div>
          </section>
        </div>

        <aside className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-24">
          <div className={card}>
            <p className="font-display font-bold text-[#3E2C23]">Lundi 12 oct.{slot ? `, ${slot}` : ""}</p>
            <p className="text-sm text-[#7a6355] mt-0.5">
              {party} convives · {zone.toLowerCase()}
            </p>

            <div className="mt-5 flex flex-col gap-2 text-sm">
              <Row label="Réservation" value="Gratuite" />
              <Row label="Acompte" value={`${a.deposit_pp} $ / personne`} />
              <Row label="Annulation" value={a.cancel_window as string} />
            </div>

            {tab === "table" ? (
              <button onClick={confirm} disabled={!slot} className={`${cta} mt-5 disabled:opacity-50`}>
                {slot ? "Confirmer la table" : "Choisissez un créneau"}
              </button>
            ) : (
              <button className={`${cta} mt-5`}>Demander une privatisation</button>
            )}

            {cart.items.some((i: any) => i.kind === "stay") && (
              <p className="text-xs text-[#00508a] bg-[#EAF8FF] rounded-xl p-3 mt-3 leading-relaxed">
                Vous avez déjà un séjour dans votre panier. Cette table s'ajoute au même paiement.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── 1d — voiture ───────────────────────────────────────── */
function CarDetail({ listing, a, rate, cart, navigate }: any) {
  const pickups: Pickup[] = (a.pickups as Pickup[]) ?? [];
  const [pickupIdx, setPickupIdx] = useState(0);
  const [withDriver, setWithDriver] = useState(false);

  const days = nightsBetween(CHECKIN, CHECKOUT);
  const base = Number(listing.price) * days;
  const driver = withDriver ? Number(a.driver_per_day ?? 0) * days : 0;
  const delivery = Number(pickups[pickupIdx]?.fee ?? 0);
  const total = base + driver + delivery;

  const book = () => {
    cart.add({
      kind: "car",
      listing_id: listing.id,
      title: listing.name,
      detail: `${formatDateRange(CHECKIN, CHECKOUT)} · ${pickups[pickupIdx]?.name ?? "retrait"} 09:00`,
      amount: total,
      starts_on: CHECKIN,
      ends_on: CHECKOUT,
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
                    pickupIdx === i ? "border-[#002089] bg-[#EAF8FF]" : "border-[#e2d5c3] hover:border-[#002089]"
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

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Field label="Retrait" value="12 oct. 09:00" />
              <Field label="Retour" value="16 oct. 09:00" />
            </div>

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
              <Row label={`${formatUsd(Number(listing.price))} × ${days} jours`} value={formatUsd(base)} />
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

            <button onClick={book} className={`${cta} mt-4`}>
              Réserver
            </button>
            <p className="text-xs text-[#7a6355] text-center mt-2.5 leading-relaxed">
              Caution de {a.deposit} $ préautorisée, non débitée
            </p>
          </div>
        </aside>
      </div>
    </>
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
