import { Navigate, Route, Routes } from "react-router-dom";
import { Lock, ShieldAlert } from "lucide-react";
import { useAuth } from "../lib/auth";
import { SPACE_HOME, useAccountSpace } from "../lib/accountSpace";
import { AdminProvider, useAdmin } from "./lib/adminAuth";
import { AdminBooting, AdminLayout } from "./components/AdminLayout";
import { Button, Card, PageHeader } from "../console/Ui";

import { Overview } from "./pages/Overview";
import { Customers } from "./pages/Customers";
import { CustomerDetail } from "./pages/CustomerDetail";
import { Partners } from "./pages/Partners";
import { PartnerDetail } from "./pages/PartnerDetail";
import { Verification, VerificationDetail } from "./pages/Verification";
import { Listings } from "./pages/Listings";
import { ListingReview } from "./pages/ListingReview";
import { ServiceListings } from "./pages/ServiceListings";
import { Reservations } from "./pages/Reservations";
import { ReservationDetail } from "./pages/ReservationDetail";
import { FinanceDashboard } from "./pages/Finance";
import { Payments, Payouts, Refunds, Transactions, Invoices } from "./pages/FinanceTables";
import { Commissions } from "./pages/Commissions";
import { Disputes, DisputeDetail } from "./pages/Disputes";
import { Reviews } from "./pages/Reviews";
import { Support, SupportTicket } from "./pages/Support";
import { Messages } from "./pages/Messages";
import { Promotions, Coupons, Featured } from "./pages/Marketing";
import { Notifications } from "./pages/Notifications";
import { Destinations } from "./pages/Destinations";
import { ContentPages, Categories, Amenities, Policies } from "./pages/Content";
import { Analytics } from "./pages/Analytics";
import { Reports } from "./pages/Reports";
import { Staff } from "./pages/Staff";
import { RolesPermissions } from "./pages/RolesPermissions";
import { AuditLogs } from "./pages/AuditLogs";
import { SecurityCenter } from "./pages/SecurityCenter";
import { SystemHealth } from "./pages/SystemHealth";
import { PlatformSettings } from "./pages/PlatformSettings";
import { Integrations } from "./pages/Integrations";
import { AdminProfile, AdminHelp } from "./pages/AdminProfile";
import { AdminLogin } from "./pages/AdminLogin";

/**
 * Admin routing.
 *
 * Two gates. `Guard` keeps non-staff out of the console entirely; `Require`
 * keeps a staff member out of screens their role does not cover. Both are
 * courtesies: the database refuses the data regardless, so a forged route only
 * ever yields an empty screen.
 */

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { me, loading } = useAdmin();
  const { space, loading: spaceLoading } = useAccountSpace();

  if (authLoading || loading || spaceLoading) return <AdminBooting />;

  // Signing in happens here rather than at /login, so the address stays on the
  // admin URL the operator typed or bookmarked.
  if (!user) return <AdminLogin />;

  if (!me?.is_staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-canvas px-4">
        <Card className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-admin-canvas text-admin-ink-3">
            <Lock className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="font-display text-lg font-semibold text-admin-ink">Accès réservé</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-admin-ink-2">
            Cette console est réservée au personnel de PAPOT. Si vous pensez qu'il s'agit d'une erreur,
            demandez à un administrateur de vous ajouter à l'équipe.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button as="link" to="/" variant="secondary">
              Retour au site
            </Button>
            <Button as="link" to={SPACE_HOME[space] ?? "/compte"} variant="primary">
              {space === "partner" ? "Mon espace partenaire" : "Mon compte"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

/** Wraps a screen that needs one permission (spec §46). */
export function Require({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = useAdmin();
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
              La permission <code className="rounded bg-admin-canvas px-1.5 py-0.5 text-[12.5px]">{permission}</code>{" "}
              est requise. Un super administrateur peut l'ajouter à votre rôle depuis Rôles et permissions.
            </p>
            <Button as="link" to="/admin" variant="secondary" className="mt-4">
              Retour à la vue d'ensemble
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

export function AdminApp() {
  return (
    <AdminProvider>
      <Guard>
        <Routes>
          {/* The layout route carries the /admin path: without it these are
              layout-only routes and every child matches from the site root,
              so the shell renders with an empty Outlet. */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Overview />} />

            <Route path="clients" element={<Require permission="view_customers"><Customers /></Require>} />
            <Route path="clients/:id" element={<Require permission="view_customers"><CustomerDetail /></Require>} />

            <Route path="partenaires" element={<Require permission="view_partners"><Partners /></Require>} />
            <Route path="partenaires/:id" element={<Require permission="view_partners"><PartnerDetail /></Require>} />
            <Route path="verification" element={<Require permission="manage_verification"><Verification /></Require>} />
            <Route path="verification/:id" element={<Require permission="manage_verification"><VerificationDetail /></Require>} />

            <Route path="annonces" element={<Require permission="view_listings"><Listings /></Require>} />
            <Route path="annonces/:id" element={<Require permission="view_listings"><ListingReview /></Require>} />
            <Route path="hotels" element={<Require permission="view_listings"><ServiceListings service="hotel" /></Require>} />
            <Route path="maisons-dhotes" element={<Require permission="view_listings"><ServiceListings service="guesthouse" /></Require>} />
            <Route path="voitures" element={<Require permission="view_listings"><ServiceListings service="car" /></Require>} />
            <Route path="restaurants" element={<Require permission="view_listings"><ServiceListings service="restaurant" /></Require>} />

            <Route path="reservations" element={<Require permission="view_bookings"><Reservations /></Require>} />
            <Route path="reservations/:reference" element={<Require permission="view_bookings"><ReservationDetail /></Require>} />

            <Route path="finance" element={<Require permission="view_payments"><FinanceDashboard /></Require>} />
            <Route path="paiements" element={<Require permission="view_payments"><Payments /></Require>} />
            <Route path="versements" element={<Require permission="view_payments"><Payouts /></Require>} />
            <Route path="remboursements" element={<Require permission="view_payments"><Refunds /></Require>} />
            <Route path="commissions" element={<Require permission="view_payments"><Commissions /></Require>} />
            <Route path="transactions" element={<Require permission="view_payments"><Transactions /></Require>} />
            <Route path="factures" element={<Require permission="view_payments"><Invoices /></Require>} />

            <Route path="litiges" element={<Require permission="view_disputes"><Disputes /></Require>} />
            <Route path="litiges/:id" element={<Require permission="view_disputes"><DisputeDetail /></Require>} />
            <Route path="avis" element={<Require permission="view_reviews"><Reviews /></Require>} />
            <Route path="support" element={<Require permission="view_support"><Support /></Require>} />
            <Route path="support/:id" element={<Require permission="view_support"><SupportTicket /></Require>} />
            <Route path="messages" element={<Require permission="view_messages"><Messages /></Require>} />

            <Route path="promotions" element={<Require permission="manage_promotions"><Promotions /></Require>} />
            <Route path="coupons" element={<Require permission="manage_promotions"><Coupons /></Require>} />
            <Route path="mises-en-avant" element={<Require permission="manage_promotions"><Featured /></Require>} />
            <Route path="notifications" element={<Require permission="manage_content"><Notifications /></Require>} />

            <Route path="destinations" element={<Require permission="manage_content"><Destinations /></Require>} />
            <Route path="categories" element={<Require permission="manage_content"><Categories /></Require>} />
            <Route path="equipements" element={<Require permission="manage_content"><Amenities /></Require>} />
            <Route path="politiques" element={<Require permission="manage_content"><Policies /></Require>} />
            <Route path="pages" element={<Require permission="manage_content"><ContentPages /></Require>} />

            <Route path="analyses" element={<Require permission="view_analytics"><Analytics /></Require>} />
            <Route path="rapports" element={<Require permission="view_analytics"><Reports /></Require>} />

            <Route path="personnel" element={<Require permission="manage_staff"><Staff /></Require>} />
            <Route path="roles" element={<Require permission="manage_staff"><RolesPermissions /></Require>} />
            <Route path="audit" element={<Require permission="view_audit_logs"><AuditLogs /></Require>} />
            <Route path="securite" element={<Require permission="view_security"><SecurityCenter /></Require>} />
            <Route path="integrations" element={<Require permission="manage_platform_settings"><Integrations /></Require>} />
            <Route path="parametres" element={<Require permission="manage_platform_settings"><PlatformSettings /></Require>} />

            <Route path="statut" element={<SystemHealth />} />
            <Route path="profil" element={<AdminProfile />} />
            <Route path="aide" element={<AdminHelp />} />

            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </Guard>
    </AdminProvider>
  );
}

export default AdminApp;
