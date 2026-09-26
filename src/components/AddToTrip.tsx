import { Link } from "react-router-dom";
import { BedDouble, Car, Check, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useCart } from "../lib/cart";
import { stayDatesQuery, type StayDates } from "../lib/stayDates";

/**
 * "Même panier, un seul paiement", made true.
 *
 * The fiche used to say a car or a table could join the trip and offer one
 * "Parcourir" link that went to cars whatever it said. It also had no idea what
 * was already in the cart, so it kept inviting you to add the thing you had
 * just added.
 *
 * This names each métier separately, skips the one whose fiche you are reading,
 * marks what the cart already holds, and carries the dates into the search so
 * the car is proposed for the nights of the stay rather than a fresh default.
 */

const OTHERS = [
  { kind: "stay", label: "Un hébergement", Glyph: BedDouble },
  { kind: "car", label: "Une voiture", Glyph: Car },
  { kind: "restaurant", label: "Une table", Glyph: UtensilsCrossed },
] as const;

export function AddToTrip({
  current,
  dates,
  className = "",
}: {
  /** The métier of the fiche being read; it is not offered again. */
  current: "stay" | "car" | "restaurant";
  /** Carried into the search, so the dates survive the detour. */
  dates?: StayDates;
  className?: string;
}) {
  const { items, count } = useCart();
  const has = (kind: string) => items.some(i => i.kind === kind);
  const suffix = dates ? `&${new URLSearchParams(stayDatesQuery(dates))}` : "";
  const rest = OTHERS.filter(o => o.kind !== current);

  return (
    <div className={`bg-[#D6F0FB] rounded-2xl p-5 ${className}`}>
      <p className="font-display font-bold text-[#002089]">Compléter le voyage</p>
      <p className="text-[13px] text-[#00508a] leading-relaxed mt-1.5">
        Une voiture, une table — ajoutés au même panier et réglés en une fois.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {rest.map(({ kind, label, Glyph }) =>
          has(kind) ? (
            <span
              key={kind}
              className="flex items-center gap-2 rounded-xl bg-white/70 px-3.5 py-2.5 text-sm font-semibold text-[#00508a]"
            >
              <Check className="h-4 w-4 shrink-0 text-[#15803d]" aria-hidden />
              {label} — dans le panier
            </span>
          ) : (
            <Link
              key={kind}
              to={`/search?kind=${kind}${suffix}`}
              className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-[#002089] border-2 border-transparent hover:border-[#002089] transition-colors"
            >
              <Glyph className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </Link>
          ),
        )}
      </div>

      {count > 0 && (
        <Link
          to="/panier"
          className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-[#002089] hover:underline"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden />
          Voir le panier · {count}
        </Link>
      )}
    </div>
  );
}
