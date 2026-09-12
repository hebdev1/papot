import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LifeBuoy, MapPin, MessageCircle, Phone } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatUsd } from "../../lib/currency";
import { formatRange, formatTime, nightsBetween, type Booking, type BookingItem } from "../../lib/panel";
import { SERVICE, ServiceBadge, StatusBadge } from "../../components/panel/Badges";
import { ErrorState, Skeleton } from "../../components/panel/States";

const card = "rounded-2xl border border-[#e2d5c3] bg-white p-5";
const h2 = "font-display text-base font-bold text-[#002089] mb-3";

/**
 * Detail page skeleton from §15: header, status, critical info, actions,
 * service details, payment, policies, help — in that order. Policies never
 * come before the facts the customer needs.
 */
export function PanelBookingDetail() {
  const { reference } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    setLoading(true);
    supabase.rpc("get_booking", { p_reference: reference }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Failed to load booking:", error);
        setError(true);
      } else {
        setBooking((data as unknown as Booking) ?? null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <>
        <BackLink />
        <ErrorState title="Cette réservation est introuvable." />
      </>
    );
  }

  const paid = Number(booking.total);

  return (
    <>
      <BackLink />

      <header className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          <span className="text-xs text-[#7a6355]">Réf. {booking.reference}</span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#002089] lg:text-3xl">
          {booking.items.length === 1 ? booking.items[0].title : "Votre voyage"}
        </h1>
        <p className="mt-1 text-sm text-[#7a6355]">
          {booking.items.length} prestation{booking.items.length > 1 ? "s" : ""} · Réservé par{" "}
          {booking.first_name}
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {booking.items.map((item, i) => (
          <ItemDetail key={i} item={item} />
        ))}

        {/* Payment (§16, §18) */}
        <section className={card}>
          <h2 className={h2}>Paiement</h2>
          <div className="flex flex-col gap-2 text-sm">
            {booking.items.map((item, i) => (
              <Row
                key={i}
                label={item.title}
                value={item.amount > 0 ? formatUsd(Number(item.amount)) : "Sans frais"}
              />
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-[#e2d5c3] pt-2.5">
              <span className="font-display font-bold text-[#3E2C23]">Total</span>
              <span className="font-display text-lg font-bold text-[#3E2C23]">{formatUsd(paid)}</span>
            </div>
            <Row label="Payé" value={formatUsd(paid)} />
            <Row label="Solde" value={formatUsd(0)} />
          </div>
          <p className="mt-3 text-xs text-[#7a6355]">
            Moyen de paiement :{" "}
            {booking.payment_method === "card" ? "Carte bancaire"
              : booking.payment_method === "moncash" ? "MonCash" : "NatCash"}
          </p>
        </section>

        {/* Policies come after the facts (§15) */}
        <section className={card}>
          <h2 className={h2}>Conditions</h2>
          <p className="text-sm leading-relaxed text-[#7a6355]">
            Annulation gratuite jusqu'à 24 h avant l'arrivée pour l'hébergement. Chaque prestataire
            applique sa propre politique.
          </p>
        </section>

        {/* Help, with the booking already attached (§30) */}
        <section className="rounded-2xl bg-[#EAF8FF] p-5">
          <h2 className="mb-1 font-display text-base font-bold text-[#002089]">
            Besoin d'aide avec cette réservation ?
          </h2>
          <p className="mb-3.5 text-[13px] leading-relaxed text-[#00508a]">
            Nous joignons automatiquement la référence {booking.reference} à votre demande.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/compte/messages"
              className="inline-flex items-center gap-2 rounded-xl bg-[#002089] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#001b6e]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Contacter l'établissement
            </Link>
            <Link
              to={`/compte/aide?ref=${booking.reference}`}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-[#002089] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#002089] transition-colors hover:bg-[#002089] hover:text-white"
            >
              <LifeBuoy className="h-4 w-4" aria-hidden />
              Contacter le support
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

/** Service-specific details (§11–13) sharing one card shell. */
function ItemDetail({ item }: { item: BookingItem }) {
  const { Icon } = SERVICE[item.kind];
  const nights = item.starts_on && item.ends_on ? nightsBetween(item.starts_on, item.ends_on) : 0;
  const place = item.location ?? item.city ?? "";

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e2d5c3] bg-white">
      <div className="flex flex-col sm:flex-row">
        <div className="h-36 shrink-0 bg-[#EAF8FF] sm:h-auto sm:w-40">
          {item.img ? (
            <img src={item.img} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-content-center text-[#00508a]">
              <Icon className="h-7 w-7" aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <ServiceBadge kind={item.kind} />
            <StatusBadge status={item.status} />
          </div>

          <h3 className="font-display text-lg font-bold text-[#3E2C23]">{item.title}</h3>
          {place && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#7a6355]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {place}
            </p>
          )}

          {/* Critical information first (§15) */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {item.kind === "stay" && (
              <>
                <Fact label="Arrivée" value={item.starts_on ? formatRange(item.starts_on, null) : "—"} />
                <Fact label="Départ" value={item.ends_on ? formatRange(item.ends_on, null) : "—"} />
                <Fact label="Nuits" value={nights > 0 ? String(nights) : "—"} />
                <Fact label="Arrivée dès" value="15 h 00" />
                <Fact label="Départ avant" value="11 h 00" />
              </>
            )}
            {item.kind === "car" && (
              <>
                <Fact label="Retrait" value={formatRange(item.starts_on, null) || "—"} />
                <Fact label="Retour" value={formatRange(item.ends_on, null) || "—"} />
                <Fact label="Jours" value={nights > 0 ? String(nights) : "—"} />
              </>
            )}
            {item.kind === "restaurant" && (
              <>
                <Fact label="Date" value={formatRange(item.starts_on, null) || "—"} />
                <Fact label="Heure" value={formatTime(item.start_time) || "—"} />
                <Fact label="Convives" value={item.party ? String(item.party) : "—"} />
              </>
            )}
          </dl>

          {!item.starts_on && item.detail && (
            <p className="mt-3 text-[13px] text-[#7a6355]">{item.detail}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {place && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.title} ${place}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#e2d5c3] px-4 py-2 text-[13px] font-semibold text-[#002089] transition-colors hover:border-[#002089]"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Itinéraire
              </a>
            )}
            <Link
              to="/compte/messages"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#e2d5c3] px-4 py-2 text-[13px] font-semibold text-[#002089] transition-colors hover:border-[#002089]"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Contacter
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#7a6355]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#3E2C23]">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0 truncate text-[#7a6355]">{label}</span>
      <span className="shrink-0 font-medium text-[#3E2C23]">{value}</span>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/compte/reservations"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#002089] hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Retour aux réservations
    </Link>
  );
}
