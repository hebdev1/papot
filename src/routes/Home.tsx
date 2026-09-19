import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Carousel } from "../components/Carousel";
import { StayCard } from "../components/StayCard";
import { RestaurantCard } from "../components/RestaurantCard";
import { OfferCard, type OfferRow } from "../components/OfferCard";
import { GuestsPicker } from "../components/GuestsPicker";
import { DEFAULT_GUESTS, guestsQuery, type Guests } from "../lib/guests";
import { defaultStayDates, nightsBetween, stayDatesQuery, type StayDates } from "../lib/stayDates";
import { StayDatesPicker } from "../components/StayDatesPicker";
import { useAiEnabled } from "../lib/aiChat";
import { CarCard } from "../components/CarCard";
import { DestinationCard } from "../components/DestinationCard";
import { PartnerSection } from "../components/PartnerSection";
import { supabase } from "../lib/supabase";
import { useUsdHtgRate } from "../lib/currency";
import type { DestinationRow, ListingRow } from "../lib/listings";

const TABS = [
  { id: "stay", label: "Hébergements", icon: <Icon.Hotel /> },
  { id: "car", label: "Voitures", icon: <Icon.Car /> },
  { id: "restaurant", label: "Restaurants", icon: <Icon.Breakfast /> },
  { id: "flight", label: "Vols", icon: <Icon.Plane /> },
];

const PERKS = [
  { icon: "🛡️", title: "Réservation sécurisée", desc: "Paiement crypté, données protégées à 100%." },
  { icon: "🔄", title: "Annulation flexible", desc: "Changez d'avis jusqu'à 24h avant l'arrivée." },
  { icon: "💬", title: "Support 24/7", desc: "Notre équipe vous accompagne à toute heure." },
  { icon: "🏆", title: "Meilleur prix garanti", desc: "On égale tout prix inférieur trouvé ailleurs." },
];

/** Section heading shared by the four carousels. */
function SectionHead({
  eyebrow,
  title,
  sub,
  cta,
  onCta,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  /** Omitted where there is nowhere to send the visitor. */
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-[0.12em] uppercase text-[#7a6355] font-semibold">{eyebrow}</span>
        <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#002089] tracking-tight">{title}</h2>
        <span className="text-sm text-[#7a6355]">{sub}</span>
      </div>
      {cta && onCta && (
        <button
          onClick={onCta}
          className="hidden sm:block shrink-0 px-5 py-2.5 rounded-xl border-2 border-[#002089] text-[#002089] font-semibold text-sm bg-white hover:bg-[#002089] hover:text-white transition-colors"
        >
          {cta}
        </button>
      )}
    </div>
  );
}

export function Home({ onPartner }: { onPartner: () => void }) {
  const navigate = useNavigate();
  const rate = useUsdHtgRate();

  const [activeTab, setActiveTab] = useState("stay");
  const [where, setWhere] = useState("");
  // A rolling window. The two dates used to be written into the file, so the
  // search bar offered the same October nights to everyone — and would have
  // offered them still after they had gone past.
  const [dates, setDates] = useState<StayDates>(defaultStayDates);
  const { checkin, checkout } = dates;
  const [guests, setGuests] = useState<Guests>(DEFAULT_GUESTS);
  const { enabled: aiOpen } = useAiEnabled();

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [savings, setSavings] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [l, d] = await Promise.all([
        supabase.from("listings").select("*").eq("published", true).order("position"),
        supabase.from("destinations_public").select("*").order("position"),
      ]);
      if (cancelled) return;
      if (l.error) console.error("Failed to load listings:", l.error);
      else setListings(l.data);
      if (d.error) console.error("Failed to load destinations:", d.error);
      else setDestinations(d.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stays = useMemo(() => listings.filter(l => l.kind === "stay"), [listings]);
  const cars = useMemo(() => listings.filter(l => l.kind === "car"), [listings]);
  const restaurants = useMemo(() => listings.filter(l => l.kind === "restaurant"), [listings]);

  const primary = destinations.filter(d => (d.tier ?? 3) <= 2);
  const alsoAvailable = destinations.filter(d => d.tier === 3);

  const nights = useMemo(() => nightsBetween(checkin, checkout), [checkin, checkout]);

  /**
   * Offers are loaded apart from the listings because their price depends on
   * how long the visitor is staying, so the section follows the dates in the
   * search bar. RLS already hides an offer that is paused, out of its window,
   * or sitting on an unpublished annonce — nothing here has to ask.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("partner_packages")
        .select("id, listing_id, name, description, price, basis, usage_limit, used_count, listings(id, name, img, location)")
        .eq("active", true)
        .order("position")
        .limit(8);
      if (cancelled) return;
      if (error) {
        console.error("Failed to load offers:", error);
        return;
      }
      const rows = (data ?? []) as unknown as OfferRow[];
      setOffers(rows);

      const answers = await Promise.all(
        rows.map(o =>
          supabase.rpc("package_quote", {
            p_package: o.id,
            p_units: o.basis === "total" ? 1 : nights,
          }),
        ),
      );
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      rows.forEach((o, i) => {
        const q = answers[i].data as unknown as { savings: number | null; savings_known: boolean } | null;
        next[o.id] = q?.savings_known && q.savings !== null ? Number(q.savings) : null;
      });
      setSavings(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [nights]);

  const search = () => {
    const p = new URLSearchParams({ kind: activeTab, ...stayDatesQuery(dates), ...guestsQuery(guests) });
    if (where.trim()) p.set("where", where.trim());
    navigate(`/search?${p}`);
  };

  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-[#002089] pb-16 pt-12 lg:pt-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-9">
            <h1 className="font-display text-4xl lg:text-5xl font-black text-white leading-[1.08] tracking-tight">
              Votre prochaine aventure
              <br />
              <span className="text-[#6ad7fb]">commence ici.</span>
            </h1>
            <p className="text-[#a8d8f0] mt-4 text-base lg:text-lg">
              Hébergements, voitures et tables partout en Haïti — réservation immédiate.
            </p>

            {/* §7. Absent tant que la passerelle est fermée : une porte qui ne
                s'ouvre pas vaut moins que pas de porte. */}
            {aiOpen && (
              <Link
                to="/planifier"
                className="inline-flex items-center gap-2 mt-6 bg-white hover:bg-[#E9F9FE] text-[#002089] font-bold px-5 py-3 rounded-xl transition-colors shadow-lg"
              >
                <span aria-hidden>✨</span>
                Planifier avec AI Papot
              </Link>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-2xl shadow-[rgba(0,0,0,0.25)] p-2.5 max-w-5xl mx-auto">
            {/* Four tabs do not fit across 375px. They scroll rather than wrap,
                so the row keeps its height and every service stays reachable. */}
            <div className="flex items-center gap-1 px-1.5 pt-1 pb-2.5 border-b border-[#e2d5c3] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    activeTab === t.id
                      ? "bg-[#E9F9FE] text-[#002089]"
                      : "text-[#7a6355] hover:text-[#002089] hover:bg-[#E9F9FE]/60"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-2 p-1.5 pt-2.5">
              <label className="flex-[1.4] flex flex-col gap-1 px-3 py-2 rounded-xl border-2 border-[#e2d5c3] focus-within:border-[#6ad7fb] transition-colors">
                <span className="text-[10px] font-semibold text-[#7a6355] uppercase tracking-wide">Destination</span>
                <div className="flex items-center gap-2">
                  <Icon.MapPin />
                  <input
                    type="text"
                    placeholder="Où voulez-vous aller ?"
                    value={where}
                    onChange={e => setWhere(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && search()}
                    className="flex-1 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none min-w-0"
                  />
                </div>
              </label>

              <StayDatesPicker value={dates} onChange={setDates} className="flex-[2]" />

              <GuestsPicker value={guests} onChange={setGuests} className="flex-1" />

              <button
                onClick={search}
                className="flex items-center justify-center gap-2 bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold px-7 rounded-xl transition-colors shadow-lg shadow-[rgba(231,111,46,0.35)] text-sm py-3.5"
              >
                <Icon.Search />
                Rechercher
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-10 flex flex-col gap-8 lg:gap-10">
        {offers.length > 0 && (
          <section>
            <SectionHead
              eyebrow="À saisir"
              title="Offres du moment"
              sub="Plusieurs prestations réunies sous un prix unique."
            />
            <Carousel ariaLabel="Offres du moment">
              {offers.map(o => (
                <OfferCard key={o.id} offer={o} units={nights} savings={savings[o.id] ?? null} />
              ))}
            </Carousel>
          </section>
        )}

        {/* 1 — Hébergements (cream) */}
        <section>
          <SectionHead
            eyebrow="Où dormir"
            title="Hébergements du moment"
            sub="Prix totaux, taxes incluses."
            cta="Tous les hébergements"
            onCta={() => navigate("/search?kind=stay")}
          />
          <div className="flex flex-col gap-5">
            {stays.map(l => (
              <StayCard key={l.id} listing={l} rate={rate} nights={nights} />
            ))}
          </div>
        </section>

        {/* 2 — Destinations (white) */}
        <section className="bg-white -mx-4 lg:-mx-8 px-4 lg:px-8 py-6 lg:py-8 rounded-3xl border border-[#e2d5c3]">
          <SectionHead
            eyebrow="Où aller"
            title="Explorer Haïti"
            sub="Neuf destinations, du nord historique aux plages du sud."
            cta="Toutes les destinations"
            onCta={() => navigate("/search?kind=stay")}
          />
          <Carousel ariaLabel="Destinations">
            {primary.map(d => (
              <DestinationCard key={d.id} dest={d} />
            ))}
          </Carousel>
          {alsoAvailable.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-2.5">
                Aussi disponibles
              </p>
              <div className="flex flex-wrap gap-2">
                {alsoAvailable.map(d => (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/search?kind=stay&where=${encodeURIComponent(d.city ?? "")}`)}
                    className="text-sm text-[#002089] border border-[#e2d5c3] hover:border-[#002089] bg-white px-3.5 py-1.5 rounded-full transition-colors"
                  >
                    {d.city}
                    {(d.hotels ?? 0) > 0 && <span className="text-[#7a6355]"> {d.hotels}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 3 — Voitures (cream) */}
        <section>
          <SectionHead
            eyebrow="Se déplacer"
            title="Voitures à louer"
            sub="Avec ou sans chauffeur, livraison à l'aéroport disponible."
            cta="Toutes les voitures"
            onCta={() => navigate("/search?kind=car")}
          />
          <Carousel ariaLabel="Voitures à louer">
            {cars.map(l => (
              <CarCard key={l.id} listing={l} rate={rate} />
            ))}
          </Carousel>
        </section>

        {/* 4 — Restaurants (white) */}
        <section className="bg-white -mx-4 lg:-mx-8 px-4 lg:px-8 py-6 lg:py-8 rounded-3xl border border-[#e2d5c3]">
          <SectionHead
            eyebrow="Réserver une table"
            title="Les restaurants du moment"
            sub="Confirmation immédiate, sans frais de réservation."
            cta="Tous les restaurants"
            onCta={() => navigate("/search?kind=restaurant")}
          />
          <Carousel ariaLabel="Restaurants">
            {restaurants.map(l => (
              <RestaurantCard key={l.id} listing={l} />
            ))}
          </Carousel>
        </section>

        {/* Perks */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {PERKS.map(p => (
            <div key={p.title} className="bg-white rounded-2xl border border-[#e2d5c3] p-5 flex flex-col gap-2">
              <span className="text-2xl">{p.icon}</span>
              <p className="font-display font-bold text-[#3E2C23]">{p.title}</p>
              <p className="text-sm text-[#7a6355] leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </section>

        <PartnerSection onOpen={onPartner} />
      </main>
    </>
  );
}
