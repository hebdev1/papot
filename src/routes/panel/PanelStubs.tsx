import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CreditCard,
  Heart,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Star,
  Luggage,
  User,
} from "lucide-react";
import { PageHeader } from "../../components/panel/PanelLayout";
import { EmptyState } from "../../components/panel/States";
import { StatusBadge } from "../../components/panel/Badges";
import { useAuth } from "../../lib/auth";
import { formatUsd } from "../../lib/currency";
import { bookingIsPast, bookingIsUpcoming, formatRange, useMyBookings } from "../../lib/panel";
import { supabase } from "../../lib/supabase";
import { TicketReceipt, type TicketMethod } from "../../components/ui/ticket-receipt";

/**
 * Sections whose backend does not exist yet (favourites, messaging,
 * notifications, reviews) render a real empty state rather than invented data
 * — the spec forbids blank screens (§33), and inventing content here would
 * misrepresent what the product can do.
 */

type Receipt = {
  id: string;
  reference: string;
  booking_ref: string | null;
  customer_label: string | null;
  amount: number;
  method: TicketMethod;
  processor_ref: string | null;
  status: string;
  created_at: string;
};

/**
 * Receipts, drawn as tickets.
 *
 * They come from `payments` rather than from the bookings: a receipt should
 * carry the payment's own reference and the four digits that were charged,
 * which is what someone reads out to support. `payments_customer_read` is what
 * lets a traveller see their own — the gate is the same RLS as everywhere else.
 *
 * No confetti here. It belongs to the moment money changes hands, not to a
 * receipt opened in March to check what was paid in January.
 */
export function PanelPayments() {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    supabase
      .from("payments")
      .select("id, reference, booking_ref, customer_label, amount, method, processor_ref, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) console.error("Failed to load receipts:", error);
        setRows((data ?? []) as unknown as Receipt[]);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const paid = rows
    .filter(r => r.status === "paid")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <>
      <PageHeader title="Paiements" subtitle="Vos transactions et reçus." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Total payé", value: formatUsd(paid) },
          { label: "Reçus", value: String(rows.length) },
          { label: "Remboursements", value: formatUsd(0) },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-[#e2d5c3] bg-white p-4">
            <p className="text-[13px] text-[#7a6355]">{s.label}</p>
            <p className="mt-1 font-display text-xl font-bold text-[#3E2C23]">{s.value}</p>
          </div>
        ))}
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Aucune transaction"
          body="Vos reçus apparaîtront ici après votre première réservation."
        />
      ) : (
        <div className="flex flex-wrap gap-5">
          {rows.map(r => (
            <TicketReceipt
              key={r.id}
              reference={r.reference}
              amount={Number(r.amount)}
              date={new Date(r.created_at)}
              payerName={r.customer_label || "Voyageur"}
              method={r.method}
              // `demo_4242` — the digits are the tail, when the processor kept any.
              last4={r.processor_ref?.match(/(\d{4})$/)?.[1] ?? null}
              barcodeValue={r.booking_ref ?? r.reference}
              subtitle={r.status === "paid" ? "Votre reçu, à garder." : "Paiement en attente."}
            />
          ))}
        </div>
      )}

      <Note>
        Moyens de paiement enregistrés, remboursements et factures PDF nécessitent la passerelle de
        paiement (section 6.1 du spec), encore à confirmer.
      </Note>
    </>
  );
}

export function PanelMessages() {
  return (
    <>
      <PageHeader title="Messages" subtitle="Vos échanges avec les établissements et le support." />
      <EmptyState
        icon={MessageCircle}
        title="Aucun message"
        body="Les messages des établissements et du support apparaîtront ici."
      />
      <Note>
        Nécessite <code className="mx-1 rounded bg-[#DAF5FE] px-1.5 py-0.5 text-[12px]">conversations</code> et
        <code className="mx-1 rounded bg-[#DAF5FE] px-1.5 py-0.5 text-[12px]">messages</code>, avec le contexte
        de réservation attaché.
      </Note>
    </>
  );
}

export function PanelNotifications() {
  return (
    <>
      <PageHeader title="Notifications" subtitle="Réservations, paiements, messages." />
      <EmptyState icon={Bell} title="Rien de neuf" body="Vos alertes apparaîtront ici." />
      <Note>
        Nécessite une table <code className="mx-1 rounded bg-[#DAF5FE] px-1.5 py-0.5 text-[12px]">notifications</code>
        et des déclencheurs sur les réservations et paiements.
      </Note>
    </>
  );
}

export function PanelReviews() {
  const { bookings } = useMyBookings();
  const waiting = bookings.filter(bookingIsPast);

  return (
    <>
      <PageHeader title="Mes avis" subtitle="Partagez votre expérience." />
      {waiting.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Aucun avis en attente"
          body="Après un séjour terminé, vous pourrez le noter ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {waiting.map(b => (
            <div key={b.id} className="rounded-2xl border border-[#e2d5c3] bg-white p-5">
              <p className="font-display font-bold text-[#3E2C23]">
                Comment s'est passé votre séjour à {b.items[0]?.title} ?
              </p>
              <button className="mt-3 rounded-xl bg-[#e76f2e] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#d05e20]">
                Écrire un avis
              </button>
            </div>
          ))}
        </div>
      )}
      <Note>
        Le formulaire (notes par critère selon le service, photos) nécessite une table
        <code className="mx-1 rounded bg-[#DAF5FE] px-1.5 py-0.5 text-[12px]">reviews</code>.
      </Note>
    </>
  );
}

export function PanelSupport() {
  const TOPICS = [
    "Problème de réservation", "Problème de paiement", "Annulation", "Remboursement",
    "Problème avec l'établissement", "Problème de véhicule", "Réservation de restaurant",
    "Problème de compte",
  ];
  return (
    <>
      <PageHeader title="Comment pouvons-nous aider ?" />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {TOPICS.map(t => (
          <button
            key={t}
            className="flex items-center gap-3 rounded-2xl border border-[#e2d5c3] bg-white p-4 text-left text-sm font-medium text-[#3E2C23] transition-colors hover:border-[#002089]"
          >
            <LifeBuoy className="h-4 w-4 shrink-0 text-[#002089]" aria-hidden />
            {t}
          </button>
        ))}
      </div>
      <Note>Les tickets nécessitent une table <code className="mx-1 rounded bg-[#DAF5FE] px-1.5 py-0.5 text-[12px]">support_tickets</code>.</Note>
    </>
  );
}

export function PanelProfile() {
  const { user, signOut } = useAuth();
  const SECTIONS = [
    "Informations personnelles", "Coordonnées", "Préférences de voyage",
    "Voyageurs enregistrés", "Documents", "Moyens de paiement", "Sécurité",
    "Notifications", "Confidentialité",
  ];
  return (
    <>
      <PageHeader title="Profil" subtitle={user?.email ?? undefined} />

      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <span className="grid h-14 w-14 shrink-0 place-content-center rounded-full bg-[#002089] text-lg font-bold text-white">
          {(user?.email?.[0] ?? "?").toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-[#3E2C23]">
            {(user?.user_metadata?.full_name as string) || user?.email?.split("@")[0]}
          </p>
          <p className="truncate text-[13px] text-[#7a6355]">{user?.email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {SECTIONS.map(s => (
          <button
            key={s}
            className="flex items-center justify-between rounded-2xl border border-[#e2d5c3] bg-white px-4 py-3.5 text-left text-sm font-medium text-[#3E2C23] transition-colors hover:border-[#002089]"
          >
            {s}
            <User className="h-4 w-4 text-[#b0a090]" aria-hidden />
          </button>
        ))}
      </div>

      {/* Mobile reaches the rest of the nav from here (§2) */}
      <div className="mt-6 grid grid-cols-2 gap-2 md:hidden">
        {[
          { to: "/compte/favoris", label: "Favoris", Icon: Heart },
          { to: "/compte/paiements", label: "Paiements", Icon: CreditCard },
          { to: "/compte/avis", label: "Avis", Icon: Star },
          { to: "/compte/notifications", label: "Notifications", Icon: Bell },
          { to: "/compte/aide", label: "Support", Icon: LifeBuoy },
        ].map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2.5 rounded-2xl border border-[#e2d5c3] bg-white px-4 py-3.5 text-sm font-medium text-[#3E2C23]"
          >
            <Icon className="h-4 w-4 shrink-0 text-[#002089]" aria-hidden />
            {label}
          </Link>
        ))}
      </div>

      <button
        onClick={signOut}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-[#e2d5c3] px-4 py-2.5 text-sm font-semibold text-[#b3261e] transition-colors hover:border-[#b3261e]"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Se déconnecter
      </button>
    </>
  );
}

/** Honest note about what is not built yet, rather than a fake screen. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-xl bg-[#DAF5FE] px-4 py-3 text-[12.5px] leading-relaxed text-[#7a6355]">
      {children}
    </p>
  );
}
