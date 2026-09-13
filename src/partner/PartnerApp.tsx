import { Navigate, Route, Routes } from "react-router-dom";
import { Building2, ShieldAlert } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button, Card, PageHeader } from "../console/Ui";
import { PartnerProvider, usePartner } from "./lib/partnerAuth";
import { PartnerLayout } from "./components/PartnerLayout";
import { PartnerLogin } from "./pages/PartnerLogin";

import { Overview } from "./pages/Overview";
import { Listings, ListingForm } from "./pages/Listings";
import { Reservations, ReservationDetail } from "./pages/Reservations";
import { Calendar, Availability } from "./pages/Planning";
import { Rates, Discounts, Fees } from "./pages/Pricing";
import { Customers, Messages, Reviews } from "./pages/Clients";
import { Finance, Payouts, Transactions, Invoices } from "./pages/Money";
import { Analytics, Reports } from "./pages/Insights";
import { BusinessProfile, Verification, Staff, Activity } from "./pages/Business";
import { BookingSettings, Notifications, Integrations, Account, PaymentSettings, Support } from "./pages/Settings";
import { Rooms, Fleet, PickupLocations, Menu, Tables } from "./pages/Operations";
import { Promotions, Coupons } from "./pages/Marketing";

/**
 * Partner routing.
 *
 * Two gates, same shape as the admin console. `Guard` keeps out anyone who is
 * not a member of a business; `Require` keeps a member out of screens their
 * role does not cover. Both are courtesies — RLS answers every query, so a
 * forged route yields an empty screen rather than someone else's business.
 */

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { memberships, loading } = usePartner();

  if (authLoading || loading) {
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

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-canvas px-4">
        <Card className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-admin-canvas text-admin-ink-3">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="font-display text-lg font-semibold text-admin-ink">
            Aucun établissement rattaché
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-admin-ink-2">
            Ce compte n'est associé à aucune entreprise partenaire. Si vous venez d'être invité,
            vérifiez que vous utilisez bien l'adresse courriel sur laquelle l'invitation a été
            envoyée. Si votre candidature est en cours, elle doit d'abord être approuvée.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button as="link" to="/" variant="secondary">Retour au site</Button>
            <Button as="link" to="/compte" variant="primary">Mon compte</Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
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
            <Route path="menu" element={<Require permission="manage_listings"><Menu /></Require>} />
            <Route path="tables" element={<Require permission="manage_listings"><Tables /></Require>} />

            <Route path="reservations" element={<Require permission="view_reservations"><Reservations /></Require>} />
            <Route path="reservations/:reference" element={<Require permission="view_reservations"><ReservationDetail /></Require>} />
            <Route path="calendrier" element={<Require permission="view_reservations"><Calendar /></Require>} />
            <Route path="disponibilite" element={<Require permission="manage_availability"><Availability /></Require>} />

            <Route path="tarifs" element={<Require permission="manage_pricing"><Rates /></Require>} />
            <Route path="remises" element={<Require permission="manage_pricing"><Discounts /></Require>} />
            <Route path="frais" element={<Require permission="manage_pricing"><Fees /></Require>} />

            <Route path="clients" element={<Require permission="view_customers"><Customers /></Require>} />
            <Route path="messages" element={<Require permission="manage_messages"><Messages /></Require>} />
            <Route path="avis" element={<Require permission="manage_reviews"><Reviews /></Require>} />

            <Route path="finance" element={<Require permission="view_finance"><Finance /></Require>} />
            <Route path="versements" element={<Require permission="view_finance"><Payouts /></Require>} />
            <Route path="transactions" element={<Require permission="view_finance"><Transactions /></Require>} />
            <Route path="factures" element={<Require permission="view_finance"><Invoices /></Require>} />

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
