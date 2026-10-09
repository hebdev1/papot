import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { formatHtg, formatUsd, useUsdHtgRate } from "../../lib/currency";
import { todayInHaiti } from "../../lib/stayDates";
import {
  busArrival,
  busDuration,
  busTime,
  useBusCities,
  useBusSearch,
  type BusResult,
} from "../../lib/bus";

/**
 * Chercher un autocar.
 *
 * Transport asks a different question from the other three services — "from
 * where, to where, which day, how many of you" — which is why it has its own
 * entry point rather than a fourth tab on /search, whose shared controls are a
 * single destination and a date range.
 *
 * The towns come from `bus_cities_served()`, so the pickers list exactly the
 * places companies actually serve, and separately for departure and arrival: a
 * stop that only lets passengers off is not offered as an origin.
 */

const SORTS = [
  { id: "departure", label: "Départ le plus tôt" },
  { id: "price", label: "Prix le plus bas" },
  { id: "duration", label: "Trajet le plus court" },
  { id: "late", label: "Départ le plus tard" },
  { id: "rating", label: "Mieux notés" },
];

export function BusSearch() {
  const [params, setParams] = useSearchParams();
  const rate = useUsdHtgRate();
  const { cities } = useBusCities();

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const date = params.get("date") ?? todayInHaiti();
  const pax = Math.min(Math.max(Number(params.get("pax")) || 1, 1), 6);
  const searched = !!from && !!to;

  const [sort, setSort] = useState("departure");
  const { results, loading, error } = useBusSearch(from, to, date, pax, searched);

  const origins = cities.filter(c => c.as_origin > 0);
  const destinations = cities.filter(c => c.as_destination > 0 && c.city !== from);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const sorted = useMemo(() => {
    const rows = [...results];
    switch (sort) {
      case "price":
        return rows.sort((a, b) => Number(a.fare) - Number(b.fare));
      case "duration":
        return rows.sort((a, b) => a.duration_minutes - b.duration_minutes);
      case "late":
        return rows.sort((a, b) => busTime(b.departs_at).localeCompare(busTime(a.departs_at)));
      case "rating":
        return rows.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
      default:
        return rows.sort((a, b) => busTime(a.departs_at).localeCompare(busTime(b.departs_at)));
    }
  }, [results, sort]);

  const cheapest = results.length > 0 ? Math.min(...results.map(r => Number(r.fare))) : null;

  return (
    <>
      {/* ── The question ── */}
      <section className="bg-[#002089] pb-12 pt-10 lg:pt-14">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h1 className="font-display text-3xl lg:text-4xl font-black text-white leading-tight">
              Billets d'autocar
              <br />
              <span className="text-[#6ad7fb]">partout en Haïti.</span>
            </h1>
            <p className="text-[#a8d8f0] mt-3 text-base">
              Comparez les compagnies, choisissez votre place, payez en ligne.
            </p>
          </div>

          <form
            onSubmit={e => e.preventDefault()}
            className="bg-white rounded-2xl shadow-2xl shadow-[rgba(0,0,0,0.25)] p-3 max-w-5xl mx-auto"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] gap-2.5">
              <Field label="Départ">
                <select
                  value={from}
                  onChange={e => set({ from: e.target.value })}
                  className={selectClass}
                  aria-label="Ville de départ"
                >
                  <option value="">Choisir une ville</option>
                  {origins.map(c => (
                    <option key={c.city} value={c.city}>{c.city}</option>
                  ))}
                </select>
              </Field>

              <Field label="Arrivée">
                <select
                  value={to}
                  onChange={e => set({ to: e.target.value })}
                  className={selectClass}
                  aria-label="Ville d'arrivée"
                >
                  <option value="">Choisir une ville</option>
                  {destinations.map(c => (
                    <option key={c.city} value={c.city}>{c.city}</option>
                  ))}
                </select>
              </Field>

              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  min={todayInHaiti()}
                  onChange={e => set({ date: e.target.value })}
                  className={selectClass}
                  aria-label="Date du voyage"
                />
              </Field>

              <Field label="Passagers">
                <select
                  value={String(pax)}
                  onChange={e => set({ pax: e.target.value })}
                  className={selectClass}
                  aria-label="Nombre de passagers"
                >
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} passager{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </Field>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!from || !to}
                  className="w-full lg:w-auto h-[46px] px-6 bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
                >
                  Rechercher
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* ── The answer ── */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12">
        {!searched ? (
          <EmptyBus
            title="Où allez-vous ?"
            body="Choisissez une ville de départ et une ville d'arrivée pour voir les départs du jour."
          />
        ) : loading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-28 rounded-2xl bg-[#E9F9FE] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <EmptyBus
            title="La recherche n'a pas abouti"
            body="Vérifiez votre connexion et réessayez."
          />
        ) : results.length === 0 ? (
          <EmptyBus
            title={`Aucun départ ${from} → ${to} ce jour-là`}
            body={
              pax > 1
                ? `Aucun autocar n'a ${pax} places libres à cette date. Essayez une autre date, ou réduisez le nombre de passagers.`
                : "Essayez une autre date : les compagnies publient leurs horaires par périodes."
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#002089]">
                  {results.length} départ{results.length > 1 ? "s" : ""} · {from} → {to}
                </h2>
                <p className="text-[#7a6355] text-sm mt-1">
                  {new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  {" · "}
                  {pax} passager{pax > 1 ? "s" : ""}
                  {cheapest !== null && ` · à partir de ${formatUsd(cheapest)}`}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#7a6355]">
                Trier :
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="border border-[#e2d5c3] rounded-xl px-3 py-2 text-sm text-[#3E2C23] bg-white focus:outline-none focus:border-[#6ad7fb]"
                >
                  {SORTS.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3">
              {sorted.map(r => (
                <BusResultCard key={r.departure_id} r={r} pax={pax} rate={rate} />
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}

const selectClass =
  "w-full h-[46px] px-3 rounded-xl border border-[#e2d5c3] bg-white text-sm text-[#3E2C23] focus:border-[#6ad7fb] outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-[#7a6355] mb-1 px-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyBus({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[#E9F9FE] border-2 border-dashed border-[#c8b9a5] rounded-2xl px-6 py-14 text-center">
      <span className="text-4xl block mb-3" aria-hidden>🚌</span>
      <p className="font-display font-bold text-[#3E2C23] text-lg mb-2">{title}</p>
      <p className="text-[#7a6355] text-sm max-w-md mx-auto leading-relaxed">{body}</p>
    </div>
  );
}

function BusResultCard({ r, pax, rate }: { r: BusResult; pax: number; rate: number }) {
  const arrival = busArrival(r.departs_at, r.duration_minutes);
  const total = Number(r.fare) * pax;
  // Scarcity is only shown when something has actually gone. "Il reste 52
  // places" under every coach would be a true sentence carrying no information,
  // which is what invented urgency looks like.
  const scarce = r.seats_left <= 5 && r.seats_left < r.seats_total;

  return (
    <article className="bg-white border border-[#e2d5c3] rounded-2xl p-4 lg:p-5 hover:border-[#6ad7fb] hover:shadow-lg hover:shadow-[rgba(0,32,137,0.06)] transition-all">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Times */}
        <div className="flex items-center gap-3 lg:gap-4 shrink-0">
          <div className="text-center">
            <p className="font-display text-xl lg:text-2xl font-bold text-[#002089] tabular-nums leading-none">
              {busTime(r.departs_at)}
            </p>
            <p className="text-[11px] text-[#7a6355] mt-1 max-w-[88px] truncate" title={r.origin_terminal}>
              {r.origin_terminal}
            </p>
          </div>

          <div className="flex flex-col items-center gap-0.5 px-1">
            <span className="text-[11px] text-[#7a6355] whitespace-nowrap">
              {busDuration(r.duration_minutes)}
            </span>
            <span className="w-14 lg:w-20 h-px bg-[#e2d5c3] relative">
              <span className="absolute -right-0.5 -top-[3px] w-1.5 h-1.5 rounded-full bg-[#e76f2e]" />
            </span>
            <span className="text-[11px] text-[#b0a090] whitespace-nowrap">
              {Number(r.intermediate_stops) === 0
                ? "direct"
                : `${r.intermediate_stops} arrêt${Number(r.intermediate_stops) > 1 ? "s" : ""}`}
            </span>
          </div>

          <div className="text-center">
            <p className="font-display text-xl lg:text-2xl font-bold text-[#002089] tabular-nums leading-none">
              {arrival.label}
              {arrival.nextDay && <span className="text-[11px] align-super ml-0.5">+1</span>}
            </p>
            <p className="text-[11px] text-[#7a6355] mt-1 max-w-[88px] truncate" title={r.destination_terminal}>
              {r.destination_terminal}
            </p>
          </div>
        </div>

        {/* Operator and coach */}
        <div className="flex-1 min-w-0 lg:border-l lg:border-[#e2d5c3] lg:pl-5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[#3E2C23] truncate">{r.operator}</p>
            {r.rating !== null && Number(r.reviews) > 0 && (
              <span className="text-[12px] text-[#7a6355] shrink-0">
                ★ {Number(r.rating).toFixed(1)}
                <span className="text-[#b0a090]"> ({r.reviews})</span>
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-[#7a6355] mt-0.5">
            {[r.coach_type, r.seat_pattern && `sièges ${r.seat_pattern}`].filter(Boolean).join(" · ") ||
              "Autocar"}
          </p>
          {r.amenities && r.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {r.amenities.slice(0, 4).map(a => (
                <span
                  key={a}
                  className="text-[11px] bg-[#E9F9FE] text-[#00508a] px-2 py-0.5 rounded-full"
                >
                  {a}
                </span>
              ))}
              {r.amenities.length > 4 && (
                <span className="text-[11px] text-[#b0a090] px-1 py-0.5">
                  +{r.amenities.length - 4}
                </span>
              )}
            </div>
          )}
          <p className="text-[11.5px] text-[#7a6355] mt-2">
            Se présenter {r.arrive_minutes_before} min avant le départ
          </p>
        </div>

        {/* Price and action */}
        <div className="shrink-0 lg:text-right lg:border-l lg:border-[#e2d5c3] lg:pl-5 flex lg:flex-col items-end lg:items-end justify-between gap-3">
          <div>
            <p className="font-display text-xl font-bold text-[#3E2C23] leading-none">
              {formatUsd(total)}
            </p>
            <p className="text-[11.5px] text-[#7a6355] mt-1">
              ≈ {formatHtg(total, rate)}
              {pax > 1 && <> · {formatUsd(Number(r.fare))} / place</>}
            </p>
            {scarce && (
              <p className="text-[11.5px] font-semibold text-[#b3261e] mt-1">
                Plus que {r.seats_left} place{r.seats_left > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <Link
            to={`/bus/depart/${r.departure_id}?pax=${pax}`}
            className="inline-flex items-center gap-1.5 bg-[#002089] hover:bg-[#001b6e] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          >
            Choisir
            <Icon.ArrowRight />
          </Link>
        </div>
      </div>
    </article>
  );
}
