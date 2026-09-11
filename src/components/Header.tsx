import { Link, NavLink } from "react-router-dom";
import { Icon } from "./Icon";
import { useAuth } from "../lib/auth";

/* Canvas 1a: Hébergements · Voitures · Restaurants · Vols, then
   Devenir partenaire / Se connecter / S'inscrire. */
const NAV = [
  { to: "/search?kind=stay", label: "Hébergements" },
  { to: "/search?kind=car", label: "Voitures" },
  { to: "/search?kind=restaurant", label: "Restaurants" },
  { to: "/search?kind=flight", label: "Vols" },
];

export function Header({ onPartner }: { onPartner?: () => void }) {
  const { user, signOut } = useAuth();

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

        <div className="flex items-center gap-2 shrink-0">
          {onPartner && (
            <button
              onClick={onPartner}
              className="hidden lg:block text-sm text-white font-semibold px-4 py-2 rounded-lg border border-white/25 hover:bg-white/10 transition-colors"
            >
              Devenir partenaire
            </button>
          )}
          {user ? (
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-sm text-white font-semibold px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Icon.Users /> Se déconnecter
            </button>
          ) : (
            <>
              <Link
                to="/login"
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
      </div>
    </header>
  );
}
