import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar, MapPin, Search } from "lucide-react";
import { PageHeader } from "../../components/panel/PanelLayout";
import { SERVICE, ServiceBadge, StatusBadge } from "../../components/panel/Badges";
import { BookingCardSkeleton, EmptyState, ErrorState } from "../../components/panel/States";
import { formatUsd } from "../../lib/currency";
import {
  formatRange,
  formatTime,
  isUpcoming,
  nightsBetween,
  useMyBookings,
  type Booking,
  type BookingItem,
} from "../../lib/panel";

const KINDS = [
  { id: "all", label: "Tout" },
  { id: "stay", label: "Hébergements" },
  { id: "car", label: "Voitures" },
  { id: "restaurant", label: "Restaurants" },
];

const STATES = [
  { id: "upcoming", label: "À venir" },
  { id: "completed", label: "Terminées" },
  { id: "pending", label: "En attente" },
  { id: "cancelled", label: "Annulées" },
];

const chip = (on: boolean) =>
  `rounded-full border-2 px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
    on ? "border-[#002089] bg-[#002089] text-white" : "border-[#e2d5c3] bg-white text-[#3E2C23] hover:border-[#002089]"
  }`;

/** Spec §9 — filters by service and by state, plus search. */
export function PanelBookings() {
  const [params, setParams] = useSearchParams();
  const { bookings, loading, error, reload } = useMyBookings();

  const [kind, setKind] = useState("all");
  const [state, setState] = useState(params.get("statut") === "pending" ? "pending" : "upcoming");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: { booking: Booking; item: BookingItem }[] = [];

    for (const b of bookings) {
      for (const item of b.items) {
        if (kind !== "all" && item.kind !== kind) continue;

        const matchesState =
          state === "cancelled" ? b.status === "cancelled"
          : state === "pending" ? item.status === "pending" && b.status !== "cancelled"
          : state === "completed" ? b.status !== "cancelled" && !isUpcoming(item)
          : b.status !== "cancelled" && isUpcoming(item);
        if (!matchesState) continue;

        if (query) {
          const hay = `${item.title} ${item.city ?? ""} ${item.location ?? ""} ${b.reference}`.toLowerCase();
          if (!hay.includes(query)) continue;
        }
        out.push({ booking: b, item });
      }
    }
    return out;
  }, [bookings, kind, state, q]);

  return (
    <>
      <PageHeader title="Mes réservations" subtitle="Tous vos séjours, voitures et tables au même endroit." />

      <label className="mb-4 flex items-center gap-2.5 rounded-xl border-2 border-[#e2d5c3] bg-white px-3.5 py-2.5 focus-within:border-[#6ad7fb]">
        <Search className="h-4 w-4 shrink-0 text-[#b0a090]" aria-hidden />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Rechercher une réservation…"
          className="min-w-0 flex-1 text-sm text-[#3E2C23] outline-none placeholder:text-[#b0a090]"
        />
      </label>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map(k => (
          <button key={k.id} onClick={() => setKind(k.id)} className={chip(kind === k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {STATES.map(s => (
          <button
            key={s.id}
            onClick={() => {
              setState(s.id);
              params.delete("statut");
              setParams(params, { replace: true });
            }}
            className={chip(state === s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState title="Nous n'avons pas pu charger vos réservations." onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucune réservation ici"
          body="Changez de filtre, ou réservez votre prochaine expérience."
          action={{ label: "Explorer", to: "/search?kind=stay" }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map(({ booking, item }, i) => (
            <BookingCard key={`${booking.id}-${i}`} booking={booking} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

/** Universal booking card (§10) — one visual system for every service. */
export function BookingCard({ booking, item }: { booking: Booking; item: BookingItem }) {
  const { Icon } = SERVICE[item.kind];
  const nights = item.starts_on && item.ends_on ? nightsBetween(item.starts_on, item.ends_on) : 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#e2d5c3] bg-white transition-shadow hover:shadow-md sm:flex-row">
      <div className="h-36 shrink-0 bg-[#EAF8FF] sm:h-auto sm:w-44">
        {item.img ? (
          <img src={item.img} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-content-center text-[#00508a]">
            <Icon className="h-7 w-7" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ServiceBadge kind={item.kind} />
          <StatusBadge status={booking.status === "cancelled" ? "cancelled" : item.status} />
        </div>

        <div>
          <h3 className="font-display text-[17px] font-bold leading-tight text-[#3E2C23]">{item.title}</h3>
          {(item.location || item.city) && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#7a6355]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {item.location ?? item.city}
            </p>
          )}
        </div>

        <p className="text-sm text-[#3E2C23]">
          {formatRange(item.starts_on, item.ends_on) || item.detail}
          {item.start_time && ` · ${formatTime(item.start_time)}`}
          {nights > 0 && <span className="text-[#7a6355]"> · {nights} nuit{nights > 1 ? "s" : ""}</span>}
        </p>

        <p className="text-xs text-[#7a6355]">
          Réf. {booking.reference}
          {item.amount > 0 && ` · ${formatUsd(Number(item.amount))}`}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-1.5">
          <Link
            to={`/compte/reservations/${booking.reference}`}
            className="rounded-xl bg-[#002089] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#001b6e]"
          >
            Voir les détails
          </Link>
          <Link
            to="/compte/messages"
            className="rounded-xl border-2 border-[#e2d5c3] px-4 py-2 text-[13px] font-semibold text-[#002089] transition-colors hover:border-[#002089]"
          >
            Contacter
          </Link>
        </div>
      </div>
    </article>
  );
}
