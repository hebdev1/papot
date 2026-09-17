import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatUsd } from "../lib/currency";
import { StatusBadge } from "../components/panel/Badges";
import { useAuth } from "../lib/auth";
import { Celebration } from "../components/ui/ticket-receipt";

type Item = { title: string; detail: string; amount: number; kind: string; status: string };
type Booking = {
  reference: string;
  first_name: string;
  email: string;
  total: number;
  status: string;
  items: Item[];
};

/** Canvas 1f — /booking/:reference/confirmed */
export function BookingConfirmed() {
  const { user } = useAuth();
  const { id } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [party, setParty] = useState(false);

  useEffect(() => {
    // Elle attend que la réservation soit là : fêter une page qui va afficher
    // « introuvable » serait grotesque. Une fois, puis elle se retire.
    if (!booking) return;
    const on = setTimeout(() => setParty(true), 150);
    const off = setTimeout(() => setParty(false), 6500);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [booking]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    supabase.rpc("get_booking", { p_reference: id }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Failed to load booking:", error);
      setBooking((data as unknown as Booking) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-24 text-center text-[#7a6355]">Chargement…</main>;

  if (!booking)
    return (
      <main className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-[#002089]">Réservation introuvable</h1>
        <p className="text-[#7a6355] mt-2">Vérifiez la référence reçue par courriel.</p>
        <Link to="/" className="inline-block mt-5 text-[#002089] font-semibold underline">
          Retour à l'accueil
        </Link>
      </main>
    );

  return (
    <main className="max-w-3xl mx-auto px-4 lg:px-8 py-14">
      {/* Une seule fois, a l'arrivee. Elle s'efface d'elle-meme, et ne part
          pas du tout pour qui a demande moins de mouvement. */}
      {party && <Celebration />}

      <div className="relative z-10 text-center flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl mb-6">✅</div>
        <h1 className="font-display text-3xl font-bold text-[#002089]">Votre voyage est confirmé</h1>
        <p className="text-[#7a6355] mt-3 max-w-lg leading-relaxed">
          Référence <span className="font-display font-bold text-[#3E2C23]">{booking.reference}</span>. Un
          récapitulatif est parti vers {booking.email}, et chaque prestataire a été prévenu.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-[#e2d5c3] p-6 mt-9">
        <div className="flex flex-col gap-3">
          {booking.items.map((i, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-4 pb-3 border-b border-[#e2d5c3] last:border-0 last:pb-0"
            >
              <div>
                <p className="font-display font-bold text-[#3E2C23]">{i.title}</p>
                <p className="text-xs text-[#7a6355] mt-0.5">{i.detail}</p>
              </div>
              <StatusBadge status={i.status === "confirmed" ? "confirmed" : "pending"} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-[#e2d5c3]">
          <span className="font-display font-bold text-[#3E2C23]">Total payé</span>
          <span className="font-display font-bold text-xl text-[#3E2C23]">{formatUsd(Number(booking.total))}</span>
        </div>
      </section>

      <section className="bg-[#EAF8FF] rounded-2xl p-6 mt-5">
        <p className="font-display font-bold text-[#002089]">Ce qui vous attend avant le départ</p>
        <p className="text-[13px] text-[#00508a] leading-relaxed mt-2">
          L'hôte vous envoie l'itinéraire d'accès 48 h avant. Le loueur demandera une photo de votre permis. Le
          restaurant confirme la table sous 24 h.
        </p>
      </section>

      <div className="flex flex-wrap gap-3 mt-7">
        {/* Menait à l'accueil, ce qui ne montrait aucune réservation. */}
        <Link
          to={user ? "/compte/reservations" : "/login"}
          className="flex-1 text-center py-3.5 rounded-xl bg-[#e76f2e] hover:bg-[#d05e20] text-white font-display font-bold text-[15px] transition-colors"
        >
          {user ? "Suivre ma réservation" : "Se connecter pour la suivre"}
        </Link>
        <button
          onClick={() => window.print()}
          className="flex-1 py-3.5 rounded-xl border-2 border-[#002089] text-[#002089] font-display font-semibold text-sm bg-white hover:bg-[#002089] hover:text-white transition-colors"
        >
          Télécharger le reçu
        </button>
      </div>
    </main>
  );
}
