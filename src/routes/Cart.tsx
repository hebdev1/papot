import { Link, useNavigate } from "react-router-dom";
import { BedDouble, Car, UtensilsCrossed } from "lucide-react";
import { formatHtg, formatUsd, useUsdHtgRate } from "../lib/currency";
import { useCart, type CartItem } from "../lib/cart";

/**
 * The one page where a trip is looked at whole.
 *
 * The fiches promised "même panier, un seul paiement" and there was nowhere to
 * see that panier: lines existed, but the only place they appeared was the
 * checkout, after the decision to pay. Someone who added a car had no way to
 * check what they were about to buy, or to drop one thing without dropping
 * everything.
 *
 * It shows what is there and what it costs, and it says plainly that the total
 * is confirmed by the server at payment — the figures are rebuilt from the
 * catalogue when the sale is made, so this page states an expectation, not a
 * promise it cannot keep.
 */

const KIND_LABEL: Record<string, string> = {
  stay: "Hébergement",
  car: "Voiture",
  restaurant: "Table",
};

/** The same three icons the account panel uses for these métiers. */
const KIND_ICON = {
  stay: BedDouble,
  car: Car,
  restaurant: UtensilsCrossed,
} as const;

/** Where to go to add the thing that is missing. */
const SUGGESTIONS: { kind: string; label: string; body: string; to: string }[] = [
  {
    kind: "stay",
    label: "Un hébergement",
    body: "Hôtels, maisons d'hôtes et villas, partout en Haïti.",
    to: "/search?kind=stay",
  },
  {
    kind: "car",
    label: "Une voiture",
    body: "Avec ou sans chauffeur, retrait à l'aéroport ou en agence.",
    to: "/search?kind=car",
  },
  {
    kind: "restaurant",
    label: "Une table",
    body: "Réservez le dîner de votre première soirée.",
    to: "/search?kind=restaurant",
  },
];

export function Cart() {
  const { items, total, remove } = useCart();
  const rate = useUsdHtgRate();
  const navigate = useNavigate();

  const missing = SUGGESTIONS.filter(s => !items.some(i => i.kind === s.kind));

  if (items.length === 0)
    return (
      <main className="max-w-3xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
        <h1 className="font-display text-3xl font-bold text-[#002089]">Votre panier</h1>
        <p className="text-[#7a6355] mt-2 leading-relaxed">
          Il est vide pour l'instant. Un séjour, une voiture et une table peuvent voyager ensemble
          ici, et se régler en une fois.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {SUGGESTIONS.map(s => (
            <Link
              key={s.kind}
              to={s.to}
              className="bg-white border-2 border-[#e2d5c3] hover:border-[#002089] rounded-2xl p-4 transition-colors"
            >
              <p className="font-display font-bold text-[#002089]">{s.label}</p>
              <p className="text-[13px] text-[#7a6355] mt-1 leading-relaxed">{s.body}</p>
            </Link>
          ))}
        </div>
      </main>
    );

  return (
    <main className="max-w-5xl mx-auto px-4 lg:px-8 py-8 lg:py-10">
      <h1 className="font-display text-3xl font-bold text-[#002089]">Votre panier</h1>
      <p className="text-sm text-[#7a6355] mt-1">
        {items.length} {items.length > 1 ? "prestations" : "prestation"} · un seul paiement
      </p>

      <div className="flex flex-col lg:flex-row gap-6 items-start mt-6">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
          {items.map(item => (
            <Line key={item.id} item={item} onRemove={() => remove(item.id!)} />
          ))}

          {missing.length > 0 && (
            <section className="bg-[#D6F0FB] rounded-2xl p-5 mt-1">
              <p className="font-display font-bold text-[#002089]">Compléter le voyage</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missing.map(s => (
                  <Link
                    key={s.kind}
                    to={s.to}
                    className="bg-white text-[#002089] text-sm font-semibold border-2 border-transparent hover:border-[#002089] px-4 py-2 rounded-xl transition-colors"
                  >
                    + {s.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="w-full lg:w-[320px] shrink-0 lg:sticky lg:top-24 bg-white rounded-2xl border border-[#e2d5c3] p-5">
          <h2 className="font-display text-lg font-bold text-[#002089]">Récapitulatif</h2>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            {items.map(item => (
              <div key={item.id} className="flex items-baseline justify-between gap-3">
                <dt className="text-[#7a6355] truncate">{KIND_LABEL[item.kind] ?? item.kind}</dt>
                <dd className="font-semibold text-[#3E2C23] tabular-nums shrink-0">
                  {formatUsd(item.amount)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-t border-[#e2d5c3] mt-3 pt-3 flex items-baseline justify-between">
            <span className="font-display font-bold text-[#3E2C23]">Total</span>
            <span className="font-display font-bold text-xl text-[#3E2C23] tabular-nums">
              {formatUsd(total)}
            </span>
          </div>
          <p className="text-xs text-[#7a6355] mt-1">≈ {formatHtg(total, rate)} au taux du jour</p>

          <button
            onClick={() => navigate(`/checkout/${items[0].listing_id}`)}
            className="w-full mt-4 py-3.5 rounded-xl bg-[#e76f2e] hover:bg-[#d05e20] text-white font-display font-bold text-[15px] shadow-[0_6px_18px_rgba(231,111,46,.3)] transition-colors"
          >
            Passer au paiement
          </button>

          {/* The tariff is rebuilt from the catalogue when the sale is made, so
              this figure is what we expect to charge, not a separate promise. */}
          <p className="text-xs text-[#7a6355] text-center mt-2.5 leading-relaxed">
            Le montant est confirmé à l'étape du paiement.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Line({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  const Glyph = KIND_ICON[item.kind as keyof typeof KIND_ICON] ?? BedDouble;

  return (
    <article className="bg-white rounded-2xl border border-[#e2d5c3] p-4 flex items-start gap-4">
      <span className="grid h-11 w-11 shrink-0 place-content-center rounded-xl bg-[#D6F0FB] text-[#002089]">
        <Glyph className="h-5 w-5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-[#7a6355] font-semibold">
          {KIND_LABEL[item.kind] ?? item.kind}
        </p>
        <p className="font-display font-bold text-[#3E2C23] leading-tight">{item.title}</p>
        {item.detail && (
          <p className="text-[13px] text-[#7a6355] mt-0.5 leading-relaxed">{item.detail}</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="font-display font-bold text-[#3E2C23] tabular-nums">{formatUsd(item.amount)}</p>
        <button
          onClick={onRemove}
          className="text-xs font-semibold text-[#7a6355] hover:text-[#b3261e] hover:underline mt-1 transition-colors"
        >
          Retirer
        </button>
      </div>
    </article>
  );
}

export default Cart;
