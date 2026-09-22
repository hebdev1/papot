import { Link } from "react-router-dom";
import { FavoriteButton } from "./FavoriteButton";
import { Badge } from "./ui/cvui-badge";
import { attrsOf, formatRating, type ListingRow } from "../lib/listings";

/** Canvas 3a — restaurant card with tonight's slots. */
export function RestaurantCard({ listing }: { listing: ListingRow }) {
  const a = attrsOf(listing);
  const slots = a.slots ?? [];

  return (
    <article className="snap-start shrink-0 w-[268px] bg-white rounded-2xl overflow-hidden border border-[#e2d5c3] hover:shadow-xl hover:shadow-[rgba(0,32,137,0.08)] transition-all duration-300 flex flex-col">
      <div className="relative h-36 bg-[#D6F0FB] flex items-center justify-center">
        {/* The photo is the card's biggest target, so it carries the link to
            the fiche. The favourite button and the badges stay outside the
            anchor: an anchor inside an anchor is invalid markup, and the heart
            has to stay clickable. */}
        <Link
          to={`/p/${listing.id}`}
          aria-label={`Voir la fiche de ${listing.name}`}
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#002089]"
        >
          {listing.img ? (
            <img src={listing.img} alt={listing.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-[#00508a]">photo — à fournir</span>
          )}
        </Link>
        <FavoriteButton listingId={listing.id} className="absolute top-3 right-3 z-10" />
        {/* A restaurant nobody has reviewed shows no score rather than a zero. */}
        {formatRating(listing) && (
          <Badge
            label={formatRating(listing)!}
            variant="primary"
            size="small"
            className="absolute top-3 left-3 z-10"
          />
        )}
        {listing.badge && (
          <Badge label={listing.badge} variant="info" size="small" className="absolute bottom-3 right-3 z-10" />
        )}
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <h3 className="font-display text-base font-bold text-[#3E2C23] leading-tight">
            <Link to={`/p/${listing.id}`} className="transition-colors hover:text-[#002089]">
              {listing.name}
            </Link>
          </h3>
          <p className="text-xs text-[#7a6355] mt-0.5">{listing.location}</p>
          <p className="text-xs text-[#7a6355] mt-1">
            <span className="font-semibold text-[#3E2C23]">{a.price_band}</span> · {listing.reviews} avis
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {listing.amenities.map(am => (
            <Badge key={am} label={am} variant="primary" appearance="subtle" size="small" animate={false} />
          ))}
        </div>

        <div className="mt-auto pt-2 border-t border-[#e2d5c3]">
          <p className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold mb-1.5">{a.slot_label}</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map(s => (
              <Link
                key={s}
                to={`/p/${listing.id}?slot=${encodeURIComponent(s)}`}
                className="text-xs font-semibold text-[#002089] border border-[#e2d5c3] hover:border-[#002089] hover:bg-[#E9F9FE] px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {s}
              </Link>
            ))}
            {a.full && (
              <span className="text-xs font-semibold text-[#7a6355] bg-[#E9F9FE] px-2.5 py-1.5 rounded-lg">
                Complet
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
