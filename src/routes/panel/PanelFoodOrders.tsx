import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UtensilsCrossed } from "lucide-react";
import { PageHeader } from "../../components/panel/PanelLayout";
import { StatusBadge } from "../../components/panel/Badges";
import { BookingCardSkeleton, EmptyState, ErrorState } from "../../components/panel/States";
import { formatUsd } from "../../lib/currency";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

/**
 * Les commandes de repas du titulaire du compte.
 *
 * Elles étaient invisibles. `place_food_order` estampille `auth.uid()` depuis
 * le premier jour, la policy `orders_customer_read` (`user_id = auth.uid()`)
 * les rend lisibles, et il existe même un index
 * `restaurant_orders_customer (user_id, created_at desc)` posé exactement pour
 * cet écran — qui n'avait jamais été écrit. Une commande passée en étant
 * connecté n'apparaissait nulle part : ni ici, ni dans « Réservations », qui
 * ne regarde que `booking_items` (les tables réservées, pas les plats).
 *
 * Lecture directe plutôt qu'une RPC : la policy fait déjà exactement le tri
 * qu'il faut, et une fonction par-dessus n'ajouterait qu'une couche à tenir.
 *
 * Le lien de suivi emporte le téléphone de la ligne. `track_food_order`
 * demande la référence ET le numéro, et c'est très bien ainsi — mais le
 * titulaire qui lit sa propre ligne lit son propre numéro, alors autant ne pas
 * le lui redemander.
 */

type Row = {
  id: string;
  reference: string;
  status: string;
  fulfillment: string;
  total: number;
  currency: string;
  created_at: string;
  customer_phone: string;
  listing_id: string;
  listings: { name: string } | null;
};

const MODE: Record<string, string> = {
  pickup: "À emporter",
  delivery: "Livraison",
  dine_in: "Sur place",
};

export function PanelFoodOrders() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(false);
    const { data, error: err } = await supabase
      .from("restaurant_orders")
      .select(
        "id, reference, status, fulfillment, total, currency, created_at, customer_phone, listing_id, listings(name)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (err) {
      console.error("Food orders failed:", err);
      setError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as unknown as Row[]);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Mes commandes"
        subtitle="Les repas commandés sur PAPOT, et où ils en sont."
      />

      {rows === null ? (
        <div className="flex flex-col gap-3">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState title="Vos commandes n'ont pas pu être chargées." onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Aucune commande"
          body="Les repas que vous commanderez sur une fiche restaurant apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(o => (
            <Link
              key={o.id}
              to={`/commande/${o.reference}?tel=${encodeURIComponent(o.customer_phone)}`}
              className="rounded-2xl border border-[#e2d5c3] bg-white p-5 transition-colors hover:border-[#002089]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-[#3E2C23]">
                    {o.listings?.name ?? "Restaurant"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[#7a6355]">
                    {o.reference} · {MODE[o.fulfillment] ?? o.fulfillment} · {when(o.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={o.status} />
                  <p className="mt-1 font-display font-bold text-[#3E2C23]">
                    {formatUsd(Number(o.total))}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Une commande passée sans être connecté ne porte aucun compte : elle
          n'est donc pas ici, et elle ne peut pas y être. Son suivi se retrouve
          par la référence et le téléphone. */}
      <p className="mt-6 text-[13px] leading-relaxed text-[#7a6355]">
        Une commande passée sans compte n'apparaît pas dans cette liste.{" "}
        <Link to="/commande" className="font-semibold text-[#002089] hover:underline">
          Retrouvez-la avec sa référence
        </Link>
        .
      </p>
    </>
  );
}
