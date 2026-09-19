import { Link } from "react-router-dom";
import { Badge } from "./ui/cvui-badge";
import { formatUsd } from "../lib/currency";
import type { DestinationRow } from "../lib/listings";

/** Canvas 3c — tier 1 is the wide feature card, tier 2 the standard tile. */
export function DestinationCard({ dest }: { dest: DestinationRow }) {
  const featured = dest.tier === 1;
  const to = `/search?kind=stay&where=${encodeURIComponent(dest.city)}`;

  return (
    <Link
      to={to}
      className={`snap-start shrink-0 group relative rounded-2xl overflow-hidden bg-[#C5E9F8] border border-[#e2d5c3] hover:shadow-xl hover:shadow-[rgba(0,32,137,0.12)] transition-all duration-300 ${
        featured ? "w-[420px] h-[280px]" : "w-[232px] h-[280px]"
      }`}
    >
      {dest.img ? (
        <img
          src={dest.img}
          alt={dest.city}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-[#00508a] bg-[#D6F0FB] text-center px-4">
          photo — {dest.city}, à fournir
        </span>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,32,137,0.85)] via-[rgba(0,32,137,0.15)] to-transparent" />

      {dest.tagline && (
        <Badge label={dest.tagline} variant="info" size="small" className="absolute top-3 left-3 z-10" />
      )}

      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="text-white font-display font-bold text-lg leading-tight">{dest.city}</p>
        <p className="text-[#6ad7fb] text-xs font-medium">
          {dest.region}
          {dest.blurb ? ` · ${dest.blurb}` : ""}
        </p>
        <p className="text-white/80 text-xs mt-1.5">
          {dest.hotels} hébergements
          {dest.restaurants > 0 && ` · ${dest.restaurants} restaurants`}
          {dest.from_usd != null && ` · dès ${formatUsd(dest.from_usd)}`}
        </p>
      </div>
    </Link>
  );
}
