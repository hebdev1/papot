import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { FavoriteButton } from "./FavoriteButton";
import { attrsOf, formatRating, isSoldOut, type ListingRow } from "../lib/listings";
import { formatHtg, formatUsd } from "../lib/currency";

/** Canvas 1a — accommodation result card. `nights` drives the stay total. */
export function StayCard({
  listing,
  rate,
  nights = 1,
}: {
  listing: ListingRow;
  rate: number;
  nights?: number;
}) {
  const a = attrsOf(listing);
  const soldOut = isSoldOut(listing);
  const total = listing.price * nights;

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-[#e2d5c3] hover:shadow-xl hover:shadow-[rgba(0,32,137,0.08)] transition-all duration-300 flex flex-col lg:flex-row group">
      <div className="relative lg:w-64 shrink-0 bg-[#EAF8FF] min-h-[180px] flex items-center justify-center">
        {listing.img ? (
          <img
            src={listing.img}
            alt={listing.name}
            className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <span className="text-xs text-[#00508a] text-center px-4">photo — à fournir</span>
        )}
        {listing.badge && (
          <div className="absolute top-3 left-3 bg-[#002089] text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
            {listing.badge}
          </div>
        )}
        <FavoriteButton listingId={listing.id} className="absolute top-3 right-3" />
      </div>

      <div className="flex-1 p-5 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs text-[#7a6355] font-medium uppercase tracking-wide">{listing.type}</span>
              <h3 className="font-display text-xl font-bold text-[#3E2C23] leading-tight">{listing.name}</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-[#002089] text-white rounded-lg px-2.5 py-1.5 shrink-0">
              <span className="font-display font-bold text-sm">{formatRating(listing)}</span>
              <span className="text-[11px] text-[#6ad7fb]">({listing.reviews})</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#7a6355] text-sm mt-1">
            <Icon.MapPin />
            <span>{listing.location}</span>
          </div>
          {a.blurb && <p className="text-sm text-[#3E2C23] mt-2 leading-relaxed">{a.blurb}</p>}
        </div>

        {listing.amenities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {listing.amenities.map(am => (
              <span
                key={am}
                className="text-xs text-[#002089] bg-[#EAF8FF] px-2.5 py-1 rounded-full font-medium"
              >
                {am}
              </span>
            ))}
          </div>
        )}

        {a.cancellation && (
          <p
            className={`text-xs font-medium ${
              a.cancellation_kind === "flexible" ? "text-[#15803d]" : "text-[#7a6355]"
            }`}
          >
            {a.cancellation}
          </p>
        )}

        <div className="flex items-end justify-between gap-4 pt-3 border-t border-[#e2d5c3]">
          <div>
            <p className="font-display text-2xl font-bold text-[#3E2C23]">
              {formatUsd(total)}
              <span className="text-sm font-normal text-[#7a6355] ml-1">
                total · {nights} nuit{nights > 1 ? "s" : ""}
              </span>
            </p>
            <p className="text-xs text-[#7a6355]">≈ {formatHtg(total, rate)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/p/${listing.id}`}
              className="text-sm font-semibold text-[#002089] px-4 py-2.5 rounded-xl border-2 border-[#e2d5c3] hover:border-[#002089] transition-colors"
            >
              Voir la fiche
            </Link>
            {soldOut ? (
              <Link
                to={`/p/${listing.id}`}
                className="bg-white border-2 border-[#002089] text-[#002089] font-bold px-5 py-2.5 rounded-xl text-sm"
              >
                Autres dates
              </Link>
            ) : (
              <Link
                to={`/checkout/${listing.id}`}
                className="bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm shadow-md shadow-[rgba(231,111,46,0.3)]"
              >
                Réserver
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
