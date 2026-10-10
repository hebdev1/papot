import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Building2, Clock, ShieldAlert } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { SPACE_HOME, useAccountSpace } from "../lib/accountSpace";
import { Button, Card, PageHeader } from "../console/Ui";
import { PartnerProvider, usePartner } from "./lib/partnerAuth";
import { PartnerLayout } from "./components/PartnerLayout";
import { PartnerLogin } from "./pages/PartnerLogin";

import { Overview } from "./pages/Overview";
import { Listings, ListingForm } from "./pages/Listings";
import { Reservations, ReservationDetail } from "./pages/Reservations";
import { Orders, OrderDetail, KitchenBoard } from "./pages/Orders";
import { MenuOptions } from "./pages/MenuOptions";
import { Stock } from "./pages/Stock";
import { Meals } from "./pages/Meals";
import { FoodMoney } from "./pages/FoodMoney";
import { Calendar, Availability } from "./pages/Planning";
import { Rates, Discounts, Fees } from "./pages/Pricing";
import { Customers, Messages, Reviews } from "./pages/Clients";
import { Finance, Payouts, Transactions, Invoices, Refunds } from "./pages/Money";
import { Analytics, Reports } from "./pages/Insights";
import { BusinessProfile, Verification, Staff, Activity } from "./pages/Business";
import { BookingSettings, Notifications, Integrations, Account, PaymentSettings, Support } from "./pages/Settings";
import { Rooms, Fleet, PickupLocations, Menu, Tables } from "./pages/Operations";
import { BusFleet, BusTerminals } from "./pages/BusNetwork";
import { BusDepartures, BusRoutes, BusSchedules } from "./pages/BusTimetable";
import { BusBoarding } from "./pages/BusBoarding";
import { BusPolicy } from "./pages/BusPolicy";
import { Promotions, Coupons } from "./pages/Marketing";
import { Packages } from "./pages/Packages";

/**
 * Partner routing.
 *
 * Two gates, same shape as the admin console. `Guard` keeps out anyone who is
 * not a member of a business; `Require` keeps a member out of screens their
 * role does not cover. Both are courtesies — RLS answers every query, so a
 * forged route yields an empty screen rather than someone else's business.
 */

function Guard({ children }: { children: React.ReactNode }) {
  const { user, signOut, loading: authLoading } = useAuth();
  const { memberships, loading } = usePartner();
  const { space, loading: spaceLoading } = useAccountSpace();

  if (authLoading || loading || spaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-canvas">
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-11 w-11 place-content-center rounded-xl bg-[#002089] font-display text-lg font-bold text-white">
            P
          </span>
          <p className="text-[13px] text-admin-ink-3">Chargement de votre espace…</p>
        </div>
      </div>
    );
  }

  // Signing in happens here rather than at /login, so the address stays on the
  // partner URL that was typed or bookmarked.
  if (!user) return <PartnerLogin />;

  // A staff account stays back-office, whatever else is attached to it.
  if (space === "admin") return <Navigate to={SPACE_HOME.admin} replace />;

  if (memberships.length === 0) return <NoBusiness email={user.email ?? ""} onSignOut={signOut} />;

  return <>{children}</>;
}

type Dossier = {
  business_name: string | null;
  type: string | null;
  status: string | null;
  submitted_at: string | null;
};

/**
 * What a partner sees before a business is attached to their account.
 *
 * Two different people land here and they need opposite things said to them:
 *
 *   * someone whose dossier is being read — tell them so, with the name they
 *     filed under and the date. "Aucun établissement rattaché" is true but it
 *     reads like a rejection to someone who applied yesterday;
 *   * someone genuinely unattached — the invitation-address explanation.
 *
 * **There is deliberately no link to `/compte` here.** `my_account_space()`
 * now answers 'partner' for anyone holding a dossier, so `RequireAuth` sends
 * them from the traveller space back to this page: a link out would be an
 * infinite bounce between the two.
 */
function NoBusiness({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> | void }) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void supabase.rpc("my_partner_application" as never).then(({ data }) => {
      if (!live) return;
      setDossier((data as Dossier | null) ?? null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  const pending = !loading && dossier && dossier.status !== "rejected";

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-canvas px-4">
      <Card className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-admin-canvas text-admin-ink-3">
          {pending ? <Clock className="h-5 w-5" aria-hidden /> : <Building2 className="h-5 w-5" aria-hidden />}
        </div>

        {pending ? (
          <>
            <h1 className="font-display text-lg font-semibold text-admin-ink">
              Dossier en cours d'examen
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-admin-ink-2">
              Nous avons bien reçu votre demande pour{" "}
              <strong className="font-semibold text-admin-ink">
                {dossier?.business_name ?? "votre entreprise"}
              </strong>
              {dossier?.submitted_at && (
                <>
                  , déposée le{" "}
                  {new Date(dossier.submitted_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </>
              )}
              .
            </p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-admin-ink-3">
              Votre espace s'ouvrira ici dès qu'un membre de l'équipe aura validé le dossier.
              Vous recevrez un e-mail à ce moment-là — rien à faire d'ici là.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-lg font-semibold text-admin-ink">
              Aucun établissement rattaché
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-admin-ink-2">
              Vous êtes connecté en tant que{" "}
              <strong className="font-semibold text-admin-ink">{email}</strong>, et cette adresse
              n'est rattachée à aucune entreprise.
            </p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-admin-ink-3">
              Une invitation est écrite sur l'adresse exacte à laquelle elle a été envoyée :
              connectez-vous avec celle-là.
            </p>
          </>
        )}

        {/* The way out is another sign-in or the public site — never /compte,
            which would redirect straight back here. */}
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" onClick={() => void onSignOut()}>
            Changer de compte
          </Button>
          <Button as="link" to="/" variant="secondary">
            Retour au site
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Require({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = usePartner();
  if (can(permission)) return <>{children}</>;

  return (
    <>
      <PageHeader title="Accès non autorisé" />
      <Card>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-[#fdf3f2] text-[#b3261e]">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-display text-[15px] font-semibold text-admin-ink">
              Votre rôle ne couvre pas cette section.
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-admin-ink-2">
              La permission{" "}
              <code className="rounded bg-admin-canvas px-1.5 py-0.5 text-[12.5px]">{permission}</code>{" "}
              est requise. Le propriétaire de l'établissement peut vous l'accorder depuis Équipe.
            </p>
            <Button as="link" to="/partenaire" variant="secondary" className="mt-4">
              Retour à la vue d'ensemble
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

export function PartnerApp() {
  return (
    <PartnerProvider>
      <Guard>
        <Routes>
          <Route path="/partenaire" element={<PartnerLayout />}>
            <Route index element={<Overview />} />

            <Route path="annonces" element={<Require permission="manage_listings"><Listings /></Require>} />
            <Route path="annonces/nouveau" element={<Require permission="manage_listings"><ListingForm /></Require>} />
            <Route path="annonces/:id/modifier" element={<Require permission="manage_listings"><ListingForm /></Require>} />
            <Route path="annonces/:id" element={<Require permission="manage_listings"><ListingForm /></Require>} />

            <Route path="chambres" element={<Require permission="manage_listings"><Rooms /></Require>} />
            <Route path="flotte" element={<Require permission="manage_listings"><Fleet /></Require>} />
            <Route path="lieux" element={<Require permission="manage_listings"><PickupLocations /></Require>} />
            <Route path="menu" element={<Require permission="manage_menu"><Menu /></Require>} />
            <Route path="options" element={<Require permission="manage_menu"><MenuOptions /></Require>} />
            <Route path="formules" element={<Require permission="manage_menu"><Meals /></Require>} />
            <Route path="tables" element={<Require permission="manage_listings"><Tables /></Require>} />
            {/* Transport. Each screen asks for the capability that owns it: a
                dispatcher moves departures without touching the fleet, and a
                driver reaches none of them. */}
            <Route path="autocars" element={<Require permission="manage_fleet"><BusFleet /></Require>} />
            <Route path="gares" element={<Require permission="manage_network"><BusTerminals /></Require>} />
            <Route path="itineraires" element={<Require permission="manage_network"><BusRoutes /></Require>} />
            <Route path="horaires" element={<Require permission="manage_departures"><BusSchedules /></Require>} />
            <Route path="departs" element={<Require permission="view_reservations"><BusDepartures /></Require>} />
            <Route path="embarquement" element={<Require permission="board_passengers"><BusBoarding /></Require>} />
            <Route path="annulation" element={<Require permission="manage_pricing"><BusPolicy /></Require>} />

            <Route path="reservations" element={<Require permission="view_reservations"><Reservations /></Require>} />
            <Route path="reservations/:reference" element={<Require permission="view_reservations"><ReservationDetail /></Require>} />
            <Route path="calendrier" element={<Require permission="view_reservations"><Calendar /></Require>} />

            <Route path="commandes" element={<Require permission="manage_orders"><Orders /></Require>} />
            <Route path="commandes/:reference" element={<Require permission="manage_orders"><OrderDetail /></Require>} />
            <Route path="cuisine" element={<Require permission="manage_orders"><KitchenBoard /></Require>} />
            <Route path="stock" element={<Require permission="manage_inventory"><Stock /></Require>} />
            <Route path="disponibilite" element={<Require permission="manage_availability"><Availability /></Require>} />

            <Route path="tarifs" element={<Require permission="manage_pricing"><Rates /></Require>} />
            <Route path="remises" element={<Require permission="manage_pricing"><Discounts /></Require>} />
            <Route path="frais" element={<Require permission="manage_pricing"><Fees /></Require>} />

            <Route path="clients" element={<Require permission="view_customers"><Customers /></Require>} />
            <Route path="messages" element={<Require permission="manage_messages"><Messages /></Require>} />
            <Route path="avis" element={<Require permission="manage_reviews"><Reviews /></Require>} />

            <Route path="finance" element={<Require permission="view_finance"><Finance /></Require>} />
            <Route path="restauration" element={<Require permission="view_finance"><FoodMoney /></Require>} />
            <Route path="versements" element={<Require permission="view_finance"><Payouts /></Require>} />
            <Route path="transactions" element={<Require permission="view_finance"><Transactions /></Require>} />
            <Route path="factures" element={<Require permission="view_finance"><Invoices /></Require>} />
            <Route path="remboursements" element={<Require permission="view_finance"><Refunds /></Require>} />

            <Route path="paquets" element={<Require permission="manage_promotions"><Packages /></Require>} />
            <Route path="promotions" element={<Require permission="manage_promotions"><Promotions /></Require>} />
            <Route path="coupons" element={<Require permission="manage_promotions"><Coupons /></Require>} />

            <Route path="analyses" element={<Require permission="view_analytics"><Analytics /></Require>} />
            <Route path="rapports" element={<Require permission="view_analytics"><Reports /></Require>} />

            <Route path="entreprise" element={<Require permission="manage_settings"><BusinessProfile /></Require>} />
            <Route path="verification" element={<Require permission="manage_documents"><Verification /></Require>} />
            <Route path="equipe" element={<Require permission="manage_staff"><Staff /></Require>} />
            <Route path="activite" element={<Activity />} />

            <Route path="reglages/reservation" element={<Require permission="manage_settings"><BookingSettings /></Require>} />
            <Route path="reglages/politiques" element={<Require permission="manage_settings"><BookingSettings /></Require>} />
            <Route path="reglages/notifications" element={<Require permission="manage_settings"><Notifications /></Require>} />
            <Route path="reglages/paiements" element={<Require permission="manage_payouts"><PaymentSettings /></Require>} />
            <Route path="reglages/integrations" element={<Require permission="manage_settings"><Integrations /></Require>} />
            <Route path="reglages/securite" element={<Account />} />
            <Route path="reglages/compte" element={<Account />} />

            <Route path="aide" element={<Support />} />
            <Route path="support" element={<Support />} />

            <Route path="*" element={<Navigate to="/partenaire" replace />} />
          </Route>
        </Routes>
      </Guard>
    </PartnerProvider>
  );
}

export default PartnerApp;
