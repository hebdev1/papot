import { Link } from "react-router-dom";
import { FavoriteButton } from "./FavoriteButton";
import { Badge } from "./ui/cvui-badge";
import { attrsOf, formatRating, type ListingRow } from "../lib/listings";
import type { Tables } from "../types/database";
import { formatHtg, formatUsd } from "../lib/currency";

/** Canvas 3b — rental car card, price per day. */
export function CarCard({
  listing,
  rate,
  detail,
}: {
  listing: ListingRow;
  rate: number;
  detail?: Tables<"car_details">;
}) {
  const a = attrsOf(listing);
  // Prefer the structured row; fall back to the free-text amenities.
  const specs = detail
    ? [detail.gearbox, `${detail.seats} places`, detail.fuel, detail.drivetrain]
    : listing.amenities;

  return (
    <article className="snap-start shrink-0 w-[268px] bg-white rounded-2xl overflow-hidden border border-[#e2d5c3] hover:shadow-xl hover:shadow-[rgba(0,32,137,0.08)] transition-all duration-300 flex flex-col">
      <div className="relative h-36 bg-[#EAF8FF] flex items-center justify-center">
        <FavoriteButton listingId={listing.id} className="absolute top-3 right-3 z-10" />
        {listing.img ? (
          <img src={listing.img} alt={listing.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-[#00508a]">photo — à fournir</span>
        )}
        <div className="absolute top-3 left-3 z-10 flex gap-1.5">
          {a.body && <Badge label={a.body} variant="primary" size="small" animate={false} />}
          {listing.badge && <Badge label={listing.badge} variant="secondary" size="small" animate={false} />}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <h3 className="font-display text-base font-bold text-[#3E2C23] leading-tight">{listing.name}</h3>
          <p className="text-xs text-[#7a6355] mt-0.5">
            {listing.vendor} · {formatRating(listing)} ({listing.reviews})
          </p>
          {detail && (
            <p className="text-[11px] text-[#7a6355] mt-0.5">
              {detail.make} {detail.model} · {detail.year}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {specs.map(am => (
            <Badge key={am} label={am} variant="primary" appearance="subtle" size="small" animate={false} />
          ))}
        </div>

        {a.perk && <p className="text-xs text-[#15803d] font-medium">{a.perk}</p>}

        <div className="mt-auto pt-2.5 border-t border-[#e2d5c3] flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-xl font-bold text-[#3E2C23]">{formatUsd(listing.price)}</p>
            <p className="text-[11px] text-[#7a6355]">par jour · ≈ {formatHtg(listing.price, rate)}</p>
          </div>
          <Link
            to={`/checkout/${listing.id}`}
            className="bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold px-4 py-2 rounded-xl transition-colors text-xs shadow-md shadow-[rgba(231,111,46,0.3)] shrink-0"
          >
            Réserver
          </Link>
        </div>
      </div>
    </article>
  );
}
