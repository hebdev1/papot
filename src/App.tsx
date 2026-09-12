import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import PartnerOnboardingWizard from "./components/PartnerOnboarding";
import { Home } from "./routes/Home";
import { Search } from "./routes/Search";
import { Login } from "./routes/Login";
import { Signup } from "./routes/Signup";
import { ResetNew, ResetRequest } from "./routes/ResetPassword";
import { CheckEmail } from "./routes/CheckEmail";
import { Property } from "./routes/Property";
import { Checkout } from "./routes/Checkout";
import { BookingConfirmed } from "./routes/BookingConfirmed";

/** Routes that render their own full-page layout, without the site chrome. */
const BARE_ROUTES = [
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

  if (bare) {
    return (
      <Routes>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <Footer />
      {partnerOpen && <PartnerOnboardingWizard onClose={() => setPartnerOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Shell />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
