import { Link } from "react-router-dom";
import { FavoriteButton } from "./FavoriteButton";
import { attrsOf, formatRating, type ListingRow } from "../lib/listings";

/** Canvas 3a — restaurant card with tonight's slots. */
export function RestaurantCard({ listing }: { listing: ListingRow }) {
  const a = attrsOf(listing);
  const slots = a.slots ?? [];

  return (
    <article className="snap-start shrink-0 w-[268px] bg-white rounded-2xl overflow-hidden border border-[#e2d5c3] hover:shadow-xl hover:shadow-[rgba(0,32,137,0.08)] transition-all duration-300 flex flex-col">
      <div className="relative h-36 bg-[#EAF8FF] flex items-center justify-center">
        <FavoriteButton listingId={listing.id} className="absolute top-3 right-3 z-10" />
        {listing.img ? (
          <img src={listing.img} alt={listing.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-[#00508a]">photo — à fournir</span>
        )}
        <span className="absolute top-3 left-3 bg-[#002089] text-white text-xs font-bold px-2 py-1 rounded-lg">
          {formatRating(listing)}
        </span>
        {listing.badge && (
          <span className="absolute top-3 right-3 bg-[#e76f2e] text-white text-[11px] font-semibold px-2 py-1 rounded-full">
            {listing.badge}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <h3 className="font-display text-base font-bold text-[#3E2C23] leading-tight">{listing.name}</h3>
          <p className="text-xs text-[#7a6355] mt-0.5">{listing.location}</p>
          <p className="text-xs text-[#7a6355] mt-1">
            <span className="font-semibold text-[#3E2C23]">{a.price_band}</span> · {listing.reviews} avis
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {listing.amenities.map(am => (
            <span key={am} className="text-[11px] text-[#002089] bg-[#EAF8FF] px-2 py-0.5 rounded-full font-medium">
              {am}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-2 border-t border-[#e2d5c3]">
          <p className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-1.5">{a.slot_label}</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map(s => (
              <Link
                key={s}
                to={`/checkout/${listing.id}?slot=${encodeURIComponent(s)}`}
                className="text-xs font-semibold text-[#002089] border border-[#e2d5c3] hover:border-[#002089] hover:bg-[#F5E9D8] px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {s}
              </Link>
            ))}
            {a.full && (
              <span className="text-xs font-semibold text-[#7a6355] bg-[#F5E9D8] px-2.5 py-1.5 rounded-lg">
                Complet
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
