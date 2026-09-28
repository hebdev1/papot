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
import { Guide } from "../Guide";
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
    </>
  );
}

export function PanelNotifications() {
  return (
    <>
      <PageHeader title="Notifications" subtitle="Réservations, paiements, messages." />
      <EmptyState icon={Bell} title="Rien de neuf" body="Vos alertes apparaîtront ici." />
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
              {/* No review form exists yet, and a button that does nothing is
                  worse than none: it reads as broken rather than unbuilt. The
                  line says what is true until the form is written. */}
              <p className="mt-2 text-[13px] text-[#7a6355]">
                La notation ouvrira bientôt. Votre séjour reste listé ici en attendant.
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Eight buttons that did nothing, above a note written for a developer —
 * "les tickets nécessitent une table support_tickets" — shown to travellers.
 * The table exists; what does not is any way for a customer to open a ticket,
 * so the buttons could not have worked. The guide replaces them with what the
 * platform can actually do, and the same page answers at /aide without an
 * account, since that is when people ask how it works.
 */
export function PanelSupport() {
  return (
    <>
      <PageHeader
        title="Comment ça marche"
        subtitle="Chercher, réserver, payer, suivre — et inscrire un établissement."
      />
      <Guide />
    </>
  );
}

/**
 * The profile screen listed nine rows — Informations personnelles, Coordonnées,
 * Préférences de voyage, Voyageurs enregistrés, Documents, Moyens de paiement,
 * Sécurité, Notifications, Confidentialité — and not one of them had a click
 * handler. Nine buttons that looked like the account settings of a real
 * product and did nothing at all.
 *
 * What exists is one table, `profiles`, with a `profiles_update_own` policy, so
 * the name and telephone are genuinely editable and are edited here. The rows
 * that have a destination now link to it; the three with no backing at all
 * (travel preferences, saved travellers, documents) are gone rather than
 * mimed.
 */
export function PanelProfile() {
  const { user, signOut } = useAuth();
  const [full_name, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        setFullName(data?.full_name ?? (user.user_metadata?.full_name as string) ?? "");
        setPhone(data?.phone ?? "");
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: full_name.trim() || null, phone: phone.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (err) {
      setError("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.");
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const field =
    "w-full rounded-xl border border-[#e2d5c3] bg-white px-3.5 py-2.5 text-sm text-[#3E2C23] outline-none focus:border-[#002089]";

  // Only destinations that exist. /compte/messages is left out on purpose:
  // there is no messaging backend, and the page says so itself.
  const LINKS = [
    { to: "/compte/paiements", label: "Moyens de paiement" },
    { to: "/compte/notifications", label: "Notifications" },
    { to: "/reset-password", label: "Sécurité — changer le mot de passe" },
    { to: "/confidentialite", label: "Confidentialité" },
    { to: "/conditions", label: "Conditions générales" },
  ];

  return (
    <>
      <PageHeader title="Profil" subtitle={user?.email ?? undefined} />

      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <span className="grid h-14 w-14 shrink-0 place-content-center rounded-full bg-[#002089] text-lg font-bold text-white">
          {(full_name?.[0] || user?.email?.[0] || "?").toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-[#3E2C23]">
            {full_name || user?.email?.split("@")[0]}
          </p>
          <p className="truncate text-[13px] text-[#7a6355]">{user?.email}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[#e2d5c3] bg-white p-5">
        <p className="font-display text-base font-bold text-[#3E2C23]">Informations personnelles</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-name" className="mb-1.5 block text-[13px] font-semibold text-[#3E2C23]">
              Nom complet
            </label>
            <input
              id="pf-name" className={field} value={full_name} disabled={!loaded}
              onChange={e => setFullName(e.target.value)} placeholder="Marie Joseph"
            />
          </div>
          <div>
            <label htmlFor="pf-phone" className="mb-1.5 block text-[13px] font-semibold text-[#3E2C23]">
              Téléphone
            </label>
            <input
              id="pf-phone" type="tel" className={field} value={phone} disabled={!loaded}
              onChange={e => setPhone(e.target.value)} placeholder="+509 0000 0000"
            />
          </div>
        </div>
        <p className="mt-3 text-[13px] text-[#7a6355]">
          L'adresse courriel sert à vous connecter et ne se change pas ici ; écrivez-nous pour
          la modifier.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button" onClick={save} disabled={!loaded || saving}
            className="rounded-xl bg-[#002089] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#6ad7fb] hover:text-[#002089] disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved && <span className="text-[13px] font-semibold text-[#15803d]">Enregistré</span>}
          {error && <span className="text-[13px] text-[#b3261e]">{error}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {LINKS.map(l => (
          <Link
            key={l.to} to={l.to}
            className="flex items-center justify-between rounded-2xl border border-[#e2d5c3] bg-white px-4 py-3.5 text-left text-sm font-medium text-[#3E2C23] transition-colors hover:border-[#002089]"
          >
            {l.label}
            <User className="h-4 w-4 text-[#b0a090]" aria-hidden />
          </Link>
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
