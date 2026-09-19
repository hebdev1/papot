import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Luggage, MapPin, Plus } from "lucide-react";
import { PageHeader } from "../../components/panel/PanelLayout";
import { SERVICE, StatusBadge } from "../../components/panel/Badges";
import { Badge } from "../../components/ui/cvui-badge";
import { EmptyState, ErrorState, Skeleton } from "../../components/panel/States";
import { TripTimeline } from "../../components/panel/TripTimeline";
import { formatUsd } from "../../lib/currency";
import {
  tripDates,
  tripIsPast,
  tripIsUpcoming,
  tripNights,
  useMyTrips,
  type Trip,
} from "../../lib/trips";

const TABS = [
  { id: "upcoming", label: "À venir" },
  { id: "past", label: "Passés" },
];

const chip = (on: boolean) =>
  `rounded-full border-2 px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
    on ? "border-[#002089] bg-[#002089] text-white" : "border-[#e2d5c3] bg-white text-[#3E2C23] hover:border-[#002089]"
  }`;

/** Spec §7 — My Trips. */
export function PanelTripsPage() {
  const { trips, loading, error, reload } = useMyTrips();
  const [tab, setTab] = useState("upcoming");

  const shown = useMemo(
    () => trips.filter(tab === "past" ? tripIsPast : tripIsUpcoming),
    [trips, tab],
  );

  return (
    <>
      <PageHeader title="Mes voyages" subtitle="Vos services regroupés par séjour." />

      <div className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={chip(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Nous n'avons pas pu charger vos voyages." onRetry={reload} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Luggage}
          title={tab === "past" ? "Aucun voyage passé" : "Aucun voyage à venir"}
          body="Vos réservations sont regroupées automatiquement en voyages, par dates."
          action={{ label: "Explorer les hébergements", to: "/search?kind=stay" }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map(t => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const cover = trip.items.find(i => i.img)?.img ?? null;
  const nights = tripNights(trip);
  const kinds = Array.from(new Set(trip.items.map(i => i.kind)));

  return (
    <Link
      to={`/compte/voyages/${trip.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-[#e2d5c3] bg-white transition-shadow hover:shadow-md sm:flex-row"
    >
      <div className="h-40 shrink-0 bg-[#D6F0FB] sm:h-auto sm:w-48">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-content-center text-[#00508a]">
            <Luggage className="h-7 w-7" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#7a6355]">
          {trip.destination ?? "Voyage"}
        </p>
        <h3 className="mt-0.5 font-display text-xl font-bold leading-tight text-[#3E2C23]">
          {tripDates(trip)}
        </h3>
        <p className="mt-1 text-sm text-[#7a6355]">
          {nights > 0 && `${nights} nuit${nights > 1 ? "s" : ""} · `}
          {trip.item_count} réservation{trip.item_count > 1 ? "s" : ""}
        </p>

        <ul className="mt-3 flex flex-col gap-1">
          {trip.items.slice(0, 3).map((i, idx) => {
            const { Icon } = SERVICE[i.kind];
            return (
              <li key={idx} className="flex items-center gap-2 text-[13px] text-[#3E2C23]">
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#7a6355]" aria-hidden />
                <span className="truncate">{i.title}</span>
              </li>
            );
          })}
          {trip.items.length > 3 && (
            <li className="text-[13px] text-[#7a6355]">+{trip.items.length - 3} autre(s)</li>
          )}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {kinds.map(k => (
            <Badge key={k} label={SERVICE[k].label} variant="primary" appearance="subtle"
                   size="small" animate={false} />
          ))}
        </div>
      </div>
    </Link>
  );
}

/** Spec §8 — the trip hub, with the timeline as its centrepiece. */
export function PanelTripDetail() {
  const { id } = useParams();
  const { trips, loading, error, reload } = useMyTrips();
  const trip = trips.find(t => t.id === id);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <>
        <Back />
        <ErrorState title="Ce voyage est introuvable." onRetry={reload} />
      </>
    );
  }

  const total = trip.items.reduce((s, i) => s + Number(i.amount), 0);
  const nights = tripNights(trip);
  const references = Array.from(new Set(trip.items.map(i => i.reference)));

  return (
    <>
      <Back />

      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#002089] lg:text-3xl">
          {trip.title ?? "Voyage"}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-[#7a6355]">
          <span>{tripDates(trip)}</span>
          {nights > 0 && <span>· {nights} nuit{nights > 1 ? "s" : ""}</span>}
          {trip.destination && (
            <span className="flex items-center gap-1">
              · <MapPin className="h-3.5 w-3.5" aria-hidden /> {trip.destination}
            </span>
          )}
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          to="/search?kind=car"
          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#002089] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#002089] transition-colors hover:bg-[#002089] hover:text-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Ajouter un service
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-xl border-2 border-[#e2d5c3] px-4 py-2.5 text-[13px] font-semibold text-[#002089] transition-colors hover:border-[#002089]"
        >
          Télécharger l'itinéraire
        </button>
      </div>

      <section className="mb-5 rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <h2 className="mb-4 font-display text-base font-bold text-[#002089]">Itinéraire</h2>
        <TripTimeline items={trip.items} />
      </section>

      <section className="mb-5 rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <h2 className="mb-3 font-display text-base font-bold text-[#002089]">Réservations</h2>
        <div className="flex flex-col gap-3">
          {trip.items.map((i, idx) => {
            const { Icon } = SERVICE[i.kind];
            return (
              <Link
                key={idx}
                to={`/compte/reservations/${i.reference}`}
                className="flex items-center gap-3 rounded-xl border border-[#e2d5c3] p-3 transition-colors hover:border-[#002089]"
              >
                <span className="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-[#D6F0FB] text-[#002089]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#3E2C23]">{i.title}</span>
                  <span className="block text-xs text-[#7a6355]">Réf. {i.reference}</span>
                </span>
                <StatusBadge status={i.status} />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <h2 className="mb-3 font-display text-base font-bold text-[#002089]">Paiements</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#7a6355]">
            {references.length} paiement{references.length > 1 ? "s" : ""}
          </span>
          <span className="font-display text-lg font-bold text-[#3E2C23]">{formatUsd(total)}</span>
        </div>
      </section>
    </>
  );
}

function Back() {
  return (
    <Link
      to="/compte/voyages"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#002089] hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Retour aux voyages
    </Link>
  );
}
