import { Link } from "react-router-dom";
import { Badge } from "./ui/cvui-badge";
import { formatUsd } from "../lib/currency";

/**
 * A promotional package on the home page.
 *
 * It is not a listing and never behaves like one: it carries no availability of
 * its own, and its card exists to send the visitor to the annonce that holds
 * it, where the offer can actually be booked.
 *
 * The saving is passed in rather than computed. `package_quote` works it out in
 * the database, and a card that did its own arithmetic would disagree with the
 * fiche within a month.
 */

export type OfferRow = {
  id: string;
  listing_id: string;
  name: string;
  description: string | null;
  price: number;
  basis: string;
  usage_limit: number | null;
  used_count: number;
  listings: { id: string; name: string; img: string | null; location: string | null } | null;
};

const unitWord = (basis: string, n: number) =>
  basis === "per_day" ? (n > 1 ? "jours" : "jour") : n > 1 ? "nuits" : "nuit";

export function OfferCard({
  offer,
  units,
  savings,
}: {
  offer: OfferRow;
  units: number;
  savings: number | null;
}) {
  const host = offer.listings;
  const left = offer.usage_limit === null ? null : Math.max(offer.usage_limit - offer.used_count, 0);
  const to = `/p/${offer.listing_id}`;

  return (
    <article className="snap-start shrink-0 w-[268px] bg-white rounded-2xl overflow-hidden border border-[#e2d5c3] hover:shadow-xl hover:shadow-[rgba(0,32,137,0.08)] transition-all duration-300 flex flex-col">
      <div className="relative h-36 bg-[#EAF8FF] flex items-center justify-center">
        <Link
          to={to}
          aria-label={`Voir l'offre ${offer.name}`}
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#002089]"
        >
          {host?.img ? (
            <img src={host.img} alt={host.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-[#00508a]">photo — à fournir</span>
          )}
        </Link>
        <Badge label="Offre" variant="secondary" size="small" className="absolute top-3 left-3 z-10" />
        {left !== null && left <= 5 && left > 0 && (
          <Badge
            label={`Plus que ${left}`}
            variant="info"
            size="small"
            className="absolute bottom-3 right-3 z-10"
          />
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div>
          <h3 className="font-display text-base font-bold text-[#3E2C23] leading-tight">
            <Link to={to} className="transition-colors hover:text-[#002089]">
              {offer.name}
            </Link>
          </h3>
          <p className="text-xs text-[#7a6355] mt-0.5">
            {host?.name}
            {host?.location ? ` · ${host.location}` : ""}
          </p>
        </div>

        {offer.description && (
          <p className="text-xs text-[#7a6355] leading-relaxed line-clamp-3">{offer.description}</p>
        )}

        <div className="mt-auto pt-2.5 border-t border-[#e2d5c3]">
          <p className="font-display text-xl font-bold text-[#3E2C23]">
            {formatUsd(offer.price * (offer.basis === "total" ? 1 : units))}
            <span className="text-[11px] font-normal text-[#7a6355] ml-1">
              {offer.basis === "total" ? "pour le tout" : `${units} ${unitWord(offer.basis, units)}`}
            </span>
          </p>
          {savings !== null && savings > 0 && (
            <p className="text-xs font-semibold text-[#15803d] mt-0.5">
              Vous économisez {formatUsd(savings)}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
