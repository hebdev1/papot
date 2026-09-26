import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { ShoppingBag } from "lucide-react";

/* Canvas 1a: Hébergements · Voitures · Restaurants · Vols, then
   Devenir partenaire / Se connecter / S'inscrire. */
const NAV = [
  { to: "/search?kind=stay", label: "Hébergements" },
  { to: "/search?kind=car", label: "Voitures" },
  { to: "/search?kind=restaurant", label: "Restaurants" },
  { to: "/search?kind=flight", label: "Vols" },
];

export function Header({ onPartner }: { onPartner?: () => void }) {
  const { user } = useAuth();
  const { count } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, search } = useLocation();

  // Close the sheet after navigating, or it stays over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="bg-[#002089] sticky top-0 z-40 shadow-lg shadow-[rgba(0,32,137,0.3)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#e76f2e] flex items-center justify-center shadow-md">
            <span className="font-display font-black text-white text-base leading-none">P</span>
          </div>
          <span className="font-display font-black text-white text-2xl tracking-tight">PAPOT</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(n => (
            <NavLink
              key={n.label}
              to={n.to}
              className={({ isActive }) =>
                `text-sm px-4 py-2 rounded-lg transition-colors font-medium ${
                  isActive ? "text-white bg-white/10" : "text-[#6ad7fb] hover:text-white hover:bg-white/10"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop actions. Below md these overflowed a 375px screen, and the
            nav above was hidden with nothing to replace it, so a phone could
            not reach Hébergements, Voitures, Restaurants or Vols at all. */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {onPartner && (
            <button
              onClick={onPartner}
              className="hidden lg:block text-sm text-white font-semibold px-4 py-2 rounded-lg border border-white/25 hover:bg-white/10 transition-colors"
            >
              Devenir partenaire
            </button>
          )}
          {/* A cart nobody can find is not a cart. It appears only when there
              is something in it, so an empty header stays quiet. */}
          {count > 0 && (
            <Link
              to="/panier"
              aria-label={`Panier, ${count} prestation${count > 1 ? "s" : ""}`}
              className="relative flex items-center gap-2 text-sm text-white font-semibold px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              <span className="grid min-w-[18px] h-[18px] place-content-center rounded-full bg-[#e76f2e] px-1 text-[11px] font-bold leading-none tabular-nums">
                {count}
              </span>
            </Link>
          )}
          {user ? (
            <Link
              to="/compte"
              className="flex items-center gap-2 text-sm text-white font-semibold px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Icon.Users /> Mon compte
            </Link>
          ) : (
            <>
              <Link
                to="/connexion"
                className="text-sm text-[#6ad7fb] hover:text-white px-4 py-2 rounded-lg transition-colors font-medium"
              >
                Se connecter
              </Link>
              <Link
                to="/signup"
                className="bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors shadow-md"
              >
                S'inscrire
              </Link>
            </>
          )}
        </div>

        {count > 0 && (
          <Link
            to="/panier"
            aria-label={`Panier, ${count} prestation${count > 1 ? "s" : ""}`}
            className="md:hidden relative ml-auto mr-1 flex h-11 w-11 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden />
            <span className="absolute right-1 top-1 grid min-w-[17px] h-[17px] place-content-center rounded-full bg-[#e76f2e] px-1 text-[10px] font-bold leading-none tabular-nums">
              {count}
            </span>
          </Link>
        )}

        {/* Mobile: one 44px target that opens everything. */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-expanded={menuOpen}
          aria-controls="menu-mobile"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          className="md:hidden shrink-0 w-11 h-11 -mr-2 flex flex-col items-center justify-center gap-[5px] rounded-lg text-white transition-colors hover:bg-white/10"
        >
          <span
            className={`block h-[2px] w-5 rounded-full bg-current transition-transform duration-200 ${
              menuOpen ? "translate-y-[7px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-[2px] w-5 rounded-full bg-current transition-opacity duration-200 ${
              menuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-[2px] w-5 rounded-full bg-current transition-transform duration-200 ${
              menuOpen ? "-translate-y-[7px] -rotate-45" : ""
            }`}
          />
        </button>
      </div>

      {menuOpen && (
        <div id="menu-mobile" className="md:hidden border-t border-white/15 bg-[#002089] px-4 pb-4 pt-2">
          <nav className="flex flex-col">
            {NAV.map(n => (
              <NavLink
                key={n.label}
                to={n.to}
                className={({ isActive }) =>
                  `min-h-[48px] flex items-center rounded-lg px-3 text-[15px] font-medium transition-colors ${
                    isActive ? "text-white bg-white/10" : "text-[#6ad7fb] hover:bg-white/10"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-2 flex flex-col gap-2 border-t border-white/15 pt-3">
            {count > 0 && (
              <Link
                to="/panier"
                className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-[15px] font-semibold text-white"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
                Votre panier · {count}
              </Link>
            )}
            {onPartner && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onPartner();
                }}
                className="min-h-[48px] rounded-xl border border-white/25 px-4 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
              >
                Devenir partenaire
              </button>
            )}

            {user ? (
              <Link
                to="/compte"
                className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-[15px] font-semibold text-white"
              >
                <Icon.Users /> Mon compte
              </Link>
            ) : (
              <>
                <Link
                  to="/connexion"
                  className="min-h-[48px] flex items-center justify-center rounded-xl border border-white/25 px-4 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Se connecter
                </Link>
                <Link
                  to="/signup"
                  className="min-h-[48px] flex items-center justify-center rounded-xl bg-[#e76f2e] px-4 text-[15px] font-bold text-white shadow-md transition-colors hover:bg-[#d05e20]"
                >
                  S'inscrire
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
