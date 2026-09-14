import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { SPACE_HOME, useAccountSpace } from "./lib/accountSpace";
import { FoodCartProvider } from "./lib/foodCart";
import { FavoritesProvider } from "./lib/favorites";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import PartnerOnboardingWizard from "./components/PartnerOnboarding";
import { Home } from "./routes/Home";
import { Search } from "./routes/Search";
import { Login } from "./routes/Login";
import { Signup } from "./routes/Signup";
import { ResetNew, ResetRequest } from "./routes/ResetPassword";
import { CheckEmail } from "./routes/CheckEmail";
import { ChooseAccount } from "./routes/ChooseAccount";
import { Property } from "./routes/Property";
import { Checkout } from "./routes/Checkout";
import { BookingConfirmed } from "./routes/BookingConfirmed";
import { FoodCheckout, OrderTracking } from "./routes/FoodOrder";
import { PanelLayout } from "./components/panel/PanelLayout";
import { PanelHome } from "./routes/panel/PanelHome";
import { PanelBookings } from "./routes/panel/PanelBookings";
import { PanelBookingDetail } from "./routes/panel/PanelBookingDetail";
import {
  PanelMessages, PanelNotifications, PanelPayments,
  PanelProfile, PanelReviews, PanelSupport,
} from "./routes/panel/PanelStubs";
import { PanelTripDetail, PanelTripsPage } from "./routes/panel/PanelTripsPage";
import { PanelFavoritesPage } from "./routes/panel/PanelFavoritesPage";
import { useAuth } from "./lib/auth";
// The admin console is a separate bundle. Loading it eagerly would put every
// admin screen, chart and table into the JavaScript a first-time visitor
// downloads to look at one listing.
const AdminApp = lazy(() => import("./admin/AdminApp"));
const PartnerApp = lazy(() => import("./partner/PartnerApp"));

/** Routes that render their own full-page layout, without the site chrome. */
const BARE_ROUTES = [
  "/connexion",
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password/nouveau",
  "/verifiez-votre-courriel",
];

function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body on purpose: a concise body would return scrollTo's value, and
  // React treats any non-function return as a cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}


function Shell() {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const [partnerOpen, setPartnerOpen] = useState(false);

  // /login links back here with ?partner=1 to open the application flow.
  useEffect(() => {
    if (params.get("partner") === "1") {
      setPartnerOpen(true);
      params.delete("partner");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const bare = BARE_ROUTES.includes(pathname);

  // The admin console is a separate application: its own shell, its own
  // navigation, its own guard. It deliberately renders none of the public site
  // chrome, and lazy-mounting it here keeps it out of every other route.
  // The partner dashboard is its own application and its own bundle, for the
  // same reason as the admin console: a traveller browsing listings should not
  // download a business operations centre.
  if (pathname.startsWith("/partenaire")) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9]">
            <span className="grid h-11 w-11 place-content-center rounded-xl bg-[#002089] font-display text-lg font-bold text-white">
              P
            </span>
          </div>
        }
      >
        <PartnerApp />
      </Suspense>
    );
  }

  if (pathname.startsWith("/admin")) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9]">
            <span className="grid h-11 w-11 place-content-center rounded-xl bg-[#002089] font-display text-lg font-bold text-white">
              P
            </span>
          </div>
        }
      >
        <AdminApp />
      </Suspense>
    );
  }

  // The customer panel carries its own sidebar/header and sits behind auth.
  if (pathname.startsWith("/compte")) {
    return (
      <RequireAuth>
        <Routes>
          <Route path="/compte" element={<PanelLayout />}>
            <Route index element={<PanelHome />} />
            <Route path="voyages" element={<PanelTripsPage />} />
            <Route path="voyages/:id" element={<PanelTripDetail />} />
            <Route path="reservations" element={<PanelBookings />} />
            <Route path="reservations/:reference" element={<PanelBookingDetail />} />
            <Route path="favoris" element={<PanelFavoritesPage />} />
            <Route path="messages" element={<PanelMessages />} />
            <Route path="paiements" element={<PanelPayments />} />
            <Route path="avis" element={<PanelReviews />} />
            <Route path="notifications" element={<PanelNotifications />} />
            <Route path="aide" element={<PanelSupport />} />
            <Route path="profil" element={<PanelProfile />} />
            <Route path="parametres" element={<PanelProfile />} />
            <Route path="recherche" element={<Navigate to="/search?kind=stay" replace />} />
            <Route path="*" element={<Navigate to="/compte" replace />} />
          </Route>
        </Routes>
      </RequireAuth>
    );
  }

  if (bare) {
    return (
      <Routes>
        <Route path="/connexion" element={<ChooseAccount />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetRequest />} />
        <Route path="/reset-password/nouveau" element={<ResetNew />} />
        <Route path="/verifiez-votre-courriel" element={<CheckEmail />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-full bg-[#F5E9D8] flex flex-col">
      <Header onPartner={() => setPartnerOpen(true)} />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Home onPartner={() => setPartnerOpen(true)} />} />
          <Route path="/search" element={<Search />} />
          <Route path="/p/:id" element={<Property />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/booking/:id/confirmed" element={<BookingConfirmed />} />
          <Route path="/commander/:id" element={<FoodCheckout />} />
          <Route path="/commande/:reference" element={<OrderTracking />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <Footer />
      {partnerOpen && <PartnerOnboardingWizard onClose={() => setPartnerOpen(false)} />}
    </div>
  );
}

/** Signed-out visitors are sent to login rather than shown an empty panel. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { space, loading: spaceLoading } = useAccountSpace();

  if (loading || spaceLoading) {
    return (
      <div className="grid min-h-screen place-content-center bg-[#FBF7F0] text-sm text-[#7a6355]">
        Chargement…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  // Each account type lives in its own dashboard. A staff member or a partner
  // who lands here is sent to theirs rather than shown a traveller's account.
  if (space === "admin" || space === "partner") {
    return <Navigate to={SPACE_HOME[space]} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <FoodCartProvider>
        <FavoritesProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Shell />
          </BrowserRouter>
        </FavoritesProvider>
        </FoodCartProvider>
      </CartProvider>
    </AuthProvider>
  );
}
