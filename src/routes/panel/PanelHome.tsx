import { Link } from "react-router-dom";
import { BedDouble, Car, Compass, MapPin, Sparkles, UtensilsCrossed } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { formatUsd } from "../../lib/currency";
import {
  bookingIsPast,
  formatRange,
  formatTime,
  nextUpItem,
  nightsBetween,
  useMyBookings,
  type BookingItem,
} from "../../lib/panel";
import { CountdownBadge, SERVICE, ServiceBadge, StatusBadge } from "../../components/panel/Badges";
import { BookingCardSkeleton, EmptyState, ErrorState } from "../../components/panel/States";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
};

const QUICK = [
  { to: "/search?kind=stay", label: "Trouver un séjour", Icon: BedDouble },
  { to: "/search?kind=car", label: "Louer une voiture", Icon: Car },
  { to: "/search?kind=restaurant", label: "Réserver une table", Icon: UtensilsCrossed },
  { to: "/", label: "Explorer Haïti", Icon: Compass },
];

/**
 * Home adapts to the customer's situation (spec §50): discovery when there is
 * nothing booked, preparation when something is coming up, reviews afterwards.
 */
export function PanelHome() {
  const { user } = useAuth();
  const { bookings, loading, error, reload } = useMyBookings();

  const firstName =
    bookings[0]?.first_name ||
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "";

  const next = nextUpItem(bookings);
  const awaitingReview = bookings.filter(bookingIsPast).slice(0, 1);
  const pendingItems = bookings
    .filter(b => b.status !== "cancelled")
    .flatMap(b => b.items)
    .filter(i => i.status === "pending");

  return (
    <>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#002089] lg:text-[32px]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-1 text-[15px] text-[#7a6355]">
          {next ? "Votre prochaine expérience approche." : "Prêt pour votre prochaine expérience ?"}
        </p>
      </header>

      {/* Required actions come before everything else (§23, §54) */}
      {pendingItems.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 font-display font-bold text-[#3E2C23]">
            <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />
            Action requise
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#7a6355]">
            {pendingItems.length === 1
              ? `${pendingItems[0].title} doit encore être confirmé par l'établissement.`
              : `${pendingItems.length} réservations attendent la confirmation de l'établissement.`}
          </p>
          <Link
            to="/compte/reservations?statut=pending"
            className="mt-3 inline-block text-sm font-semibold text-[#002089] underline"
          >
            Voir les réservations
          </Link>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#7a6355]">
          Votre prochaine réservation
        </h2>

        {loading ? (
          <BookingCardSkeleton />
        ) : error ? (
          <ErrorState title="Nous n'avons pas pu charger vos réservations." onRetry={reload} />
        ) : next ? (
          <NextUpCard item={next.item} reference={next.booking.reference} />
        ) : (
          <EmptyState
            icon={Compass}
            title="Aucune réservation à venir"
            body="Vos prochaines aventures apparaîtront ici dès votre première réservation."
            action={{ label: "Explorer les hébergements", to: "/search?kind=stay" }}
          />
        )}
      </section>

      {/* Quick actions — horizontal swipe on mobile (§5) */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#7a6355]">
          Actions rapides
        </h2>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
          {QUICK.map(({ to, label, Icon }) => (
            <Link
              key={label}
              to={to}
              className="flex min-h-[92px] w-[150px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[#e2d5c3] bg-white p-4 transition-all hover:border-[#002089] hover:shadow-md sm:w-auto"
            >
              <span className="grid h-9 w-9 place-content-center rounded-xl bg-[#EAF8FF] text-[#002089]">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="mt-3 text-sm font-semibold leading-tight text-[#3E2C23]">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {awaitingReview.length > 0 && (
        <section className="mb-8 rounded-2xl border border-[#e2d5c3] bg-white p-5">
          <p className="font-display font-bold text-[#3E2C23]">
            Comment s'est passé votre séjour à {awaitingReview[0].items[0]?.title} ?
          </p>
          <p className="mt-1 text-sm text-[#7a6355]">
            Votre avis aide les autres voyageurs à choisir.
          </p>
          <Link
            to="/compte/avis"
            className="mt-3 inline-block rounded-xl bg-[#e76f2e] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#d05e20]"
          >
            Écrire un avis
          </Link>
        </section>
      )}
    </>
  );
}

/** The large hero card from §4. */
function NextUpCard({ item, reference }: { item: BookingItem; reference: string }) {
  const { Icon } = SERVICE[item.kind === "stay" ? "stay" : item.kind];
  const nights = item.starts_on && item.ends_on ? nightsBetween(item.starts_on, item.ends_on) : 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#e2d5c3] bg-white shadow-sm">
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-44 shrink-0 bg-[#EAF8FF] sm:h-auto sm:w-56">
          {item.img ? (
            <img src={item.img} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-content-center text-xs text-[#00508a]">
              <Icon className="mx-auto h-7 w-7" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ServiceBadge kind={item.kind} />
            <StatusBadge status={item.status} />
          </div>

          <div>
            <h3 className="font-display text-xl font-bold leading-tight text-[#3E2C23]">{item.title}</h3>
            {(item.location || item.city) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[#7a6355]">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.location ?? item.city}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#3E2C23]">
            <span className="font-semibold">
              {formatRange(item.starts_on, item.ends_on)}
              {item.start_time && ` · ${formatTime(item.start_time)}`}
            </span>
            {nights > 0 && (
              <span className="text-[#7a6355]">
                {nights} nuit{nights > 1 ? "s" : ""}
              </span>
            )}
            {item.party && <span className="text-[#7a6355]">{item.party} personnes</span>}
          </div>

          {item.starts_on && <CountdownBadge date={item.starts_on} />}

          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Link
              to={`/compte/reservations/${reference}`}
              className="rounded-xl bg-[#e76f2e] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#d05e20]"
            >
              Voir la réservation
            </Link>
            {(item.location || item.city) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${item.title} ${item.location ?? item.city}`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border-2 border-[#e2d5c3] px-5 py-2.5 text-sm font-semibold text-[#002089] transition-colors hover:border-[#002089]"
              >
                Itinéraire
              </a>
            )}
          </div>

          {item.amount > 0 && (
            <p className="text-xs text-[#7a6355]">
              Payé · {formatUsd(Number(item.amount))} · Réf. {reference}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
