import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { formatHtg, formatUsd, useUsdHtgRate } from "../../lib/currency";
import { useCart } from "../../lib/cart";
import { useAuth } from "../../lib/auth";
import {
  busArrival,
  busDuration,
  busTime,
  holdSeats,
  releaseSeats,
  useBusDeparture,
  useSeatMap,
  type BusSeat,
  useRouteReviews,
} from "../../lib/bus";

/**
 * Le trajet, les places, les passagers.
 *
 * Three decisions on one page, in the order a traveller makes them, because
 * splitting them across routes would mean holding a seat across a navigation
 * and losing it to a back button.
 *
 * Nothing here computes a price. The fare classes arrive from
 * `bus_departure_detail` with their amounts already resolved by the same
 * expression the checkout will charge, and the line this page puts in the cart
 * carries names — `departure_id`, `fare_class`, `extra_bags` — which
 * `quote_booking_item` turns into money. The figure shown beside the button is
 * an expectation; the server's is the one that counts, and they are computed
 * from the same rows.
 */
export function BusDeparture() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rate = useUsdHtgRate();
  const cart = useCart();
  const { user } = useAuth();

  const { detail, loading } = useBusDeparture(id);
  const { seats, loading: seatsLoading, reload: reloadSeats } = useSeatMap(id);

  const pax = Math.min(Math.max(Number(params.get("pax")) || 1, 1), 6);
  const [chosen, setChosen] = useState<number[]>([]);
  const [fareClass, setFareClass] = useState("standard");
  const [bags, setBags] = useState(0);
  const [people, setPeople] = useState(() =>
    Array.from({ length: pax }, () => ({ first: "", last: "", phone: "" })),
  );
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /**
   * A coach has a seat plan only if the company drew one. When it has none the
   * places are unnumbered and there is nothing to choose — the server assigns
   * them in boarding order, and pretending otherwise would be a picker that
   * decides nothing.
   */
  const hasPlan = seats.length > 0 && seats.some(s => s.code !== String(s.seat_no));

  // Give the seats back if the traveller leaves without paying. Only a
  // signed-in traveller can hold any, so a guest makes no request at all.
  useEffect(() => {
    if (!user) return;
    return () => void releaseSeats();
  }, [user]);

  const fare = useMemo(() => {
    if (!detail) return 0;
    const f = detail.fares.find(x => x.class === fareClass);
    return Number(f?.amount ?? detail.fare);
  }, [detail, fareClass]);

  const bagPrice = Number(detail?.luggage?.extra_price_per_bag ?? 0);
  const maxBags = Number(detail?.luggage?.max_extra_bags ?? 0);
  const total = fare * pax + bagPrice * bags;

  const namesComplete = people.every(p => p.first.trim() && p.last.trim());
  const seatsComplete = !hasPlan || chosen.length === pax;

  const toggleSeat = (s: BusSeat) => {
    if (s.state !== "available") return;
    setNotice(null);
    setChosen(prev =>
      prev.includes(s.seat_no)
        ? prev.filter(n => n !== s.seat_no)
        : prev.length >= pax
          ? [...prev.slice(1), s.seat_no]
          : [...prev, s.seat_no],
    );
  };

  const addToCart = async () => {
    if (!detail || !id) return;
    setAdding(true);
    setNotice(null);

    // Try to hold them. A guest gets no hold by design and goes straight on:
    // the seats are claimed atomically at payment instead.
    const res = await holdSeats(id, chosen, pax);
    if (res.error) {
      setAdding(false);
      setNotice(res.error);
      reloadSeats();
      return;
    }
    if (!res.guest && res.short) {
      setAdding(false);
      setNotice(
        "Une des places vient d'être prise pendant que vous choisissiez. Le plan est à jour.",
      );
      setChosen([]);
      reloadSeats();
      return;
    }
    if (!res.guest) setHoldUntil(res.heldUntil ?? null);

    const arrival = busArrival(detail.departs_at, detail.duration_minutes);
    const origin = detail.stops.find(s => s.boarding);
    const terminus = [...detail.stops].reverse().find(s => s.alighting);

    cart.add({
      kind: "bus",
      listing_id: detail.listing_id,
      title: detail.route,
      detail: [
        `${busTime(detail.departs_at)} → ${arrival.label}${arrival.nextDay ? " (+1)" : ""}`,
        `${pax} place${pax > 1 ? "s" : ""}`,
        hasPlan && chosen.length > 0
          ? `siège${chosen.length > 1 ? "s" : ""} ${chosen
              .map(n => seats.find(s => s.seat_no === n)?.code ?? n)
              .join(", ")}`
          : null,
        bags > 0 ? `${bags} bagage${bags > 1 ? "s" : ""} en plus` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: total,
      starts_on: detail.departs_on,
      start_time: detail.departs_at,
      party: pax,
      departure_id: detail.departure_id,
      fare_class: fareClass,
      seat_nos: hasPlan && chosen.length === pax ? chosen : null,
      extra_bags: bags || null,
      passengers: people.map(p => ({
        first: p.first.trim(),
        last: p.last.trim(),
        phone: p.phone.trim() || undefined,
      })),
    });

    setAdding(false);
    navigate(`/checkout/${detail.listing_id}`);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10">
        <div className="h-40 rounded-2xl bg-[#E9F9FE] animate-pulse mb-4" />
        <div className="h-64 rounded-2xl bg-[#E9F9FE] animate-pulse" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-16 text-center">
        <span className="text-4xl block mb-3" aria-hidden>🚌</span>
        <h1 className="font-display text-2xl font-bold text-[#002089] mb-2">
          Ce départ n'est plus proposé
        </h1>
        <p className="text-[#7a6355] text-sm mb-6">
          Il a peut-être été annulé, ou le trajet n'est plus publié.
        </p>
        <Link
          to="/bus"
          className="inline-flex bg-[#002089] hover:bg-[#001b6e] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          Chercher un autre autocar
        </Link>
      </div>
    );
  }

  const arrival = busArrival(detail.departs_at, detail.duration_minutes);
  const av = detail.availability;
  const sellable = av?.available !== false;

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <Link to="/bus" className="text-sm text-[#002089] font-semibold hover:underline">
        ← Tous les départs
      </Link>

      {/* ── The journey ── */}
      <header className="mt-4 mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-[#002089]">
          {detail.route}
        </h1>
        <p className="text-[#7a6355] text-sm mt-1">
          {detail.operator}
          {detail.rating !== null && Number(detail.reviews) > 0 && (
            <> · ★ {Number(detail.rating).toFixed(1)} ({detail.reviews} avis)</>
          )}
          {" · "}
          {new Date(`${detail.departs_on}T12:00:00`).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </header>

      {detail.status === "cancelled" && (
        <Notice tone="error">
          Ce départ a été annulé par la compagnie. Si vous avez déjà un billet, elle vous
          contactera pour un report ou un remboursement.
        </Notice>
      )}
      {detail.delayed_to && (
        <Notice tone="warn">
          Départ retardé : {busTime(detail.departs_at)} → <strong>{busTime(detail.delayed_to)}</strong>
          {detail.delay_reason ? ` — ${detail.delay_reason}` : ""}
        </Notice>
      )}
      {sellable === false && detail.status !== "cancelled" && (
        <Notice tone="warn">{av?.reason ?? "Ce départ n'est plus en vente."}</Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="min-w-0 flex flex-col gap-5">
          {/* Itinerary */}
          <section className="bg-white border border-[#e2d5c3] rounded-2xl p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="text-center">
                <p className="font-display text-2xl font-bold text-[#002089] tabular-nums leading-none">
                  {busTime(detail.departs_at)}
                </p>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <span className="text-[11.5px] text-[#7a6355]">
                  {busDuration(detail.duration_minutes)}
                </span>
                <span className="w-full h-px bg-[#e2d5c3] my-1" />
                <span className="text-[11.5px] text-[#b0a090]">
                  {detail.coach?.type ?? "Autocar"}
                </span>
              </div>
              <div className="text-center">
                <p className="font-display text-2xl font-bold text-[#002089] tabular-nums leading-none">
                  {arrival.label}
                  {arrival.nextDay && <span className="text-xs align-super ml-0.5">+1</span>}
                </p>
              </div>
            </div>

            <ol className="flex flex-col gap-0">
              {detail.stops.map((s, i) => (
                <li key={s.position} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                        i === 0 || i === detail.stops.length - 1 ? "bg-[#e76f2e]" : "bg-[#c8b9a5]"
                      }`}
                    />
                    {i < detail.stops.length - 1 && <span className="w-px flex-1 bg-[#e2d5c3]" />}
                  </div>
                  <div className="pb-4 min-w-0">
                    <p className="text-sm font-semibold text-[#3E2C23]">
                      {s.city}
                      {/* A stop the company never timed shows no time rather
                          than a plausible invention. */}
                      {s.arrive_offset_minutes !== null && (
                        <span className="ml-2 text-[12.5px] font-normal text-[#7a6355] tabular-nums">
                          {busArrival(detail.departs_at, s.arrive_offset_minutes).label}
                        </span>
                      )}
                    </p>
                    <p className="text-[12.5px] text-[#7a6355]">{s.terminal}</p>
                    {s.address && <p className="text-[12.5px] text-[#b0a090]">{s.address}</p>}
                    {!s.boarding && i === 0 && (
                      <p className="text-[12px] text-[#b0a090]">Débarquement uniquement</p>
                    )}
                    {i === 0 && (
                      <p className="text-[12px] text-[#00508a] mt-0.5">
                        Se présenter {s.arrive_minutes_before} min avant
                      </p>
                    )}
                    {s.instructions && i === 0 && (
                      <p className="text-[12px] text-[#7a6355] mt-0.5">{s.instructions}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {detail.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-4 border-t border-[#e2d5c3]">
                {detail.amenities.map(a => (
                  <span
                    key={a}
                    className="text-[11.5px] bg-[#E9F9FE] text-[#00508a] px-2.5 py-1 rounded-full"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Seats */}
          {hasPlan && sellable && (
            <section className="bg-white border border-[#e2d5c3] rounded-2xl p-5">
              <h2 className="font-display text-lg font-bold text-[#002089]">
                Choisissez {pax === 1 ? "votre place" : `vos ${pax} places`}
              </h2>
              <p className="text-[12.5px] text-[#7a6355] mt-0.5 mb-4">
                {chosen.length === 0
                  ? "Touchez un siège sur le plan."
                  : `${chosen.length} / ${pax} choisie${chosen.length > 1 ? "s" : ""} : ${chosen
                      .map(n => seats.find(s => s.seat_no === n)?.code ?? n)
                      .join(", ")}`}
              </p>
              {seatsLoading ? (
                <div className="h-40 rounded-xl bg-[#E9F9FE] animate-pulse" />
              ) : (
                <SeatPlan
                  seats={seats}
                  pattern={detail.coach?.pattern ?? "2+2"}
                  chosen={chosen}
                  onToggle={toggleSeat}
                />
              )}
              <div className="flex flex-wrap gap-4 mt-4 text-[11.5px] text-[#7a6355]">
                <Legend className="bg-white border-[#c8b9a5]" label="Libre" />
                <Legend className="bg-[#002089] border-[#002089]" label="Votre choix" />
                <Legend className="bg-[#e2d5c3] border-[#e2d5c3]" label="Occupé" />
              </div>
            </section>
          )}

          {/* Passengers */}
          {sellable && (
            <section className="bg-white border border-[#e2d5c3] rounded-2xl p-5">
              <h2 className="font-display text-lg font-bold text-[#002089]">Passagers</h2>
              <p className="text-[12.5px] text-[#7a6355] mt-0.5 mb-4">
                Le nom imprimé sur chaque billet. Il est vérifié à l'embarquement, donnez-le
                tel qu'il figure sur la pièce d'identité.
              </p>
              <div className="flex flex-col gap-4">
                {people.map((p, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      value={p.first}
                      onChange={e =>
                        setPeople(prev =>
                          prev.map((x, j) => (j === i ? { ...x, first: e.target.value } : x)),
                        )
                      }
                      placeholder={i === 0 ? "Prénom" : `Prénom (passager ${i + 1})`}
                      aria-label={`Prénom du passager ${i + 1}`}
                      className={inputClass}
                    />
                    <input
                      value={p.last}
                      onChange={e =>
                        setPeople(prev =>
                          prev.map((x, j) => (j === i ? { ...x, last: e.target.value } : x)),
                        )
                      }
                      placeholder="Nom"
                      aria-label={`Nom du passager ${i + 1}`}
                      className={inputClass}
                    />
                    <input
                      value={p.phone}
                      onChange={e =>
                        setPeople(prev =>
                          prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)),
                        )
                      }
                      placeholder="Téléphone (optionnel)"
                      aria-label={`Téléphone du passager ${i + 1}`}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Luggage */}
          {detail.luggage && (
            <section className="bg-white border border-[#e2d5c3] rounded-2xl p-5">
              <h2 className="font-display text-lg font-bold text-[#002089]">Bagages</h2>
              <ul className="text-[13px] text-[#3E2C23] mt-2 space-y-1">
                {detail.luggage.free_kg !== null && (
                  <li>{detail.luggage.free_kg} kg en soute compris</li>
                )}
                {detail.luggage.carry_on_kg !== null && (
                  <li>{detail.luggage.carry_on_kg} kg en cabine</li>
                )}
                {detail.luggage.oversize_rule && <li>{detail.luggage.oversize_rule}</li>}
                {detail.luggage.note && (
                  <li className="text-[#7a6355]">{detail.luggage.note}</li>
                )}
              </ul>
              {maxBags > 0 && bagPrice > 0 && sellable && (
                <label className="flex items-center gap-3 mt-4 text-[13px] text-[#3E2C23]">
                  Bagages supplémentaires
                  <select
                    value={String(bags)}
                    onChange={e => setBags(Number(e.target.value))}
                    className="border border-[#e2d5c3] rounded-xl px-3 py-2 text-sm bg-white focus:border-[#6ad7fb] outline-none"
                  >
                    {Array.from({ length: maxBags + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Aucun" : `${n} × ${formatUsd(bagPrice)}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>
          )}
        </div>

        {/* ── The summary ── */}
        <aside className="w-full lg:sticky lg:top-24">
          <div className="bg-white border border-[#e2d5c3] rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold text-[#002089] mb-3">Votre billet</h2>

            {detail.fares.length > 0 && sellable && (
              <label className="block mb-4">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-[#7a6355] mb-1">
                  Tarif
                </span>
                <select
                  value={fareClass}
                  onChange={e => setFareClass(e.target.value)}
                  className="w-full border border-[#e2d5c3] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#6ad7fb] outline-none"
                >
                  <option value="standard">Plein tarif — {formatUsd(detail.fare)}</option>
                  {detail.fares
                    .filter(f => f.class !== "standard")
                    .map(f => (
                      <option key={f.class} value={f.class}>
                        {f.label} — {formatUsd(f.amount)}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <dl className="text-sm flex flex-col gap-2">
              <Row label={`${pax} × place`} value={formatUsd(fare * pax)} />
              {bags > 0 && <Row label={`${bags} × bagage`} value={formatUsd(bagPrice * bags)} />}
              <div className="border-t border-[#e2d5c3] pt-2.5 mt-1 flex items-center justify-between">
                <dt className="font-display font-bold text-[#3E2C23]">Total</dt>
                <dd className="font-display font-bold text-xl text-[#3E2C23]">
                  {formatUsd(total)}
                </dd>
              </div>
              <p className="text-[11.5px] text-[#7a6355]">≈ {formatHtg(total, rate)}</p>
            </dl>

            {notice && <Notice tone="warn">{notice}</Notice>}

            {holdUntil && (
              <p className="text-[11.5px] text-[#00508a] mt-3">
                Vos places sont retenues 10 minutes, le temps du paiement.
              </p>
            )}

            {sellable ? (
              <>
                <button
                  onClick={addToCart}
                  disabled={adding || !namesComplete || !seatsComplete}
                  className="w-full mt-4 bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors inline-flex items-center justify-center gap-2"
                >
                  {adding ? "Un instant…" : "Continuer vers le paiement"}
                  {!adding && <Icon.ArrowRight />}
                </button>
                {(!namesComplete || !seatsComplete) && (
                  <p className="text-[11.5px] text-[#7a6355] mt-2 text-center">
                    {!seatsComplete
                      ? `Choisissez ${pax} place${pax > 1 ? "s" : ""} sur le plan.`
                      : "Indiquez le nom de chaque passager."}
                  </p>
                )}
                <p className="text-[11.5px] text-[#7a6355] mt-3 leading-relaxed">
                  Le montant est confirmé par PAPOT au moment du paiement : il est recalculé
                  depuis les tarifs de la compagnie.
                </p>
              </>
            ) : (
              <Link
                to="/bus"
                className="w-full mt-4 bg-[#002089] hover:bg-[#001b6e] text-white font-bold py-3 rounded-xl transition-colors inline-flex items-center justify-center"
              >
                Voir les autres départs
              </Link>
            )}
          </div>
        </aside>
      </div>

      <RouteReviewsBlock listingId={detail.listing_id} />
    </div>
  );
}

const inputClass =
  "w-full p-3 rounded-xl border-2 border-[#e2d5c3] focus:border-[#6ad7fb] bg-white text-sm text-[#002089] placeholder:text-[#b0a090] outline-none transition-colors";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#7a6355]">{label}</dt>
      <dd className="text-[#3E2C23] font-medium">{value}</dd>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3.5 h-3.5 rounded border ${className}`} />
      {label}
    </span>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={`mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
        tone === "error"
          ? "bg-[#fdecea] border border-[#f5c2bd] text-[#b3261e]"
          : "bg-[#fff8e1] border border-[#f0dca8] text-[#8a6d1f]"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The coach, drawn.
 *
 * The aisle comes from the pattern rather than from the data: `2+2` puts it
 * after the second seat of each row, `2+1` after the second, `1+1` after the
 * first. Storing a gap column would have encoded one layout's opinion in every
 * seat row.
 */
function SeatPlan({
  seats,
  pattern,
  chosen,
  onToggle,
}: {
  seats: BusSeat[];
  pattern: string;
  chosen: number[];
  onToggle: (s: BusSeat) => void;
}) {
  const perRow = pattern === "2+1" ? 3 : pattern === "1+1" ? 2 : 4;
  const aisleAfter = pattern === "1+1" ? 1 : 2;

  const rows: BusSeat[][] = [];
  for (let i = 0; i < seats.length; i += perRow) rows.push(seats.slice(i, i + perRow));

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <p className="text-[11px] text-[#b0a090] mb-2 text-right pr-1">Avant du car ↑</p>
        <div className="flex flex-col gap-1.5">
          {rows.map((row, ri) => (
            <div key={ri} className="flex items-center gap-1.5">
              {row.map((s, ci) => (
                <span key={s.seat_no} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggle(s)}
                    disabled={s.state !== "available"}
                    aria-label={`Siège ${s.code}${
                      s.state === "available" ? "" : " — indisponible"
                    }`}
                    aria-pressed={chosen.includes(s.seat_no)}
                    title={s.code}
                    className={`w-10 h-10 rounded-lg border text-[11.5px] font-semibold transition-colors ${
                      chosen.includes(s.seat_no)
                        ? "bg-[#002089] border-[#002089] text-white"
                        : s.state === "available"
                          ? "bg-white border-[#c8b9a5] text-[#3E2C23] hover:border-[#6ad7fb]"
                          : "bg-[#e2d5c3] border-[#e2d5c3] text-[#9b8b7a] cursor-not-allowed"
                    }`}
                  >
                    {s.code}
                  </button>
                  {ci === aisleAfter - 1 && row.length > aisleAfter && <span className="w-5" />}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Ce que les voyageurs ont dit de ce trajet.
 *
 * Published reviews only — that filter lives in `bus_route_reviews`, not here,
 * so a pending or hidden review cannot reach a browser even by mistake.
 *
 * A sub-score is shown only when somebody actually gave it. Averaging a
 * missing answer as a zero would turn silence into a complaint, and showing
 * "—" for every category on a route with two reviews is more honest than four
 * confident-looking bars built on nothing.
 */
function RouteReviewsBlock({ listingId }: { listingId: string }) {
  const data = useRouteReviews(listingId);

  if (!data || !data.count) return null;

  const subs: [string, number | null][] = [
    ["Ponctualité", data.punctuality],
    ["Confort", data.comfort],
    ["Propreté", data.cleanliness],
    ["Service", data.service],
  ];
  const shown = subs.filter(([, v]) => v !== null);

  return (
    <section className="mt-6 bg-white rounded-2xl border border-[#e2d5c3] p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <h2 className="font-display text-lg font-bold text-[#3E2C23]">Avis des voyageurs</h2>
        <p className="text-[13px] text-[#7a6355]">
          ★ {Number(data.rating).toFixed(1)} · {data.count} avis
        </p>
      </div>

      {shown.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 pb-5 border-b border-[#e2d5c3]">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-[#7a6355]">
                {label}
              </dt>
              <dd className="font-display font-bold text-[#3E2C23] tabular-nums">
                {Number(value).toFixed(1)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <ul className="flex flex-col gap-4">
        {data.reviews.map((r, i) => (
          <li key={i} className="text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold text-[#3E2C23]">
                {r.author ?? "Voyageur"}{" "}
                <span className="font-normal text-[#f0a500]">
                  {"★".repeat(r.rating)}
                </span>
              </p>
              <span className="text-[11.5px] text-[#b0a090] shrink-0">
                {new Date(r.on).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </span>
            </div>
            {r.title && <p className="font-medium text-[#3E2C23] mt-0.5">{r.title}</p>}
            {r.body && <p className="text-[#7a6355] mt-0.5 leading-relaxed">{r.body}</p>}
            {r.reply && (
              <p className="mt-2 bg-[#E9F9FE] rounded-xl px-3 py-2 text-[12.5px] text-[#00508a]">
                <strong>Réponse de la compagnie :</strong> {r.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
