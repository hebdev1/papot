import { Link } from "react-router-dom";

/* Canvas 1a footer: PAPOT · Hébergements · Restaurants · Voitures · Aide ·
   Conditions, with the language/currency indicator (1h). */
const LINKS = [
  { to: "/search?kind=stay", label: "Hébergements" },
  { to: "/search?kind=restaurant", label: "Restaurants" },
  { to: "/search?kind=car", label: "Voitures" },
  { to: "/aide", label: "Aide" },
  { to: "/conditions", label: "Conditions" },
];

export function Footer({ locale = "Français", currency = "USD $" }) {
  return (
    <footer className="bg-[#002089] mt-16">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#e76f2e] flex items-center justify-center">
            <span className="font-display font-black text-white text-sm leading-none">P</span>
          </div>
          <span className="font-display font-black text-white text-xl tracking-tight">PAPOT</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LINKS.map(l => (
            <Link key={l.label} to={l.to} className="text-sm text-[#6ad7fb] hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <span className="text-sm text-[#a8d8f0]">
          {locale} · {currency}
        </span>
      </div>
    </footer>
  );
}
