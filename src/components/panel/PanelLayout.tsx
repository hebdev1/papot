import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  BedDouble,
  Calendar,
  ChevronsRight,
  CreditCard,
  Heart,
  HelpCircle,
  Home,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  Star,
  Luggage,
  User,
} from "lucide-react";
import { useAuth } from "../../lib/auth";

/**
 * Customer panel shell.
 *
 * Structure follows the collapsible-sidebar reference, but the palette is
 * PAPOT's own — the spec (§42, §54) is explicit that this must read as a
 * travel app, not an admin console, so the reference's gray-50/blue-500
 * defaults are deliberately not carried over.
 *
 * Mobile is a real bottom tab bar rather than a squeezed sidebar (§2).
 */

const NAV = [
  { to: "/compte", label: "Accueil", Icon: Home, end: true },
  { to: "/compte/voyages", label: "Mes voyages", Icon: Luggage },
  { to: "/compte/reservations", label: "Réservations", Icon: Calendar },
  { to: "/compte/favoris", label: "Favoris", Icon: Heart },
  { to: "/compte/messages", label: "Messages", Icon: MessageCircle },
  { to: "/compte/paiements", label: "Paiements", Icon: CreditCard },
  { to: "/compte/avis", label: "Avis", Icon: Star },
  { to: "/compte/notifications", label: "Notifications", Icon: Bell },
  { to: "/compte/aide", label: "Support", Icon: LifeBuoy },
  { to: "/compte/profil", label: "Profil", Icon: User },
];

/** Five items maximum on mobile (§2); the rest live under Profil. */
const MOBILE_NAV = [
  { to: "/compte", label: "Accueil", Icon: Home, end: true },
  { to: "/compte/voyages", label: "Voyages", Icon: Luggage },
  { to: "/compte/reservations", label: "Résa", Icon: Calendar },
  { to: "/compte/messages", label: "Messages", Icon: MessageCircle },
  { to: "/compte/profil", label: "Profil", Icon: User },
];

const STORAGE_KEY = "papot.panel.sidebar";

export function PanelLayout() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "closed";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
    } catch {
      /* private mode — the preference just won't persist */
    }
  }, [open]);

  return (
    <div className="flex min-h-screen bg-[#FBF7F0]">
      <DesktopSidebar open={open} setOpen={setOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PanelHeader />
        {/* pb clears the mobile tab bar */}
        <main className="flex-1 px-4 pb-28 pt-6 lg:px-8 lg:pb-12">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

function DesktopSidebar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { signOut } = useAuth();

  return (
    <nav
      aria-label="Navigation du compte"
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[#e2d5c3] bg-white transition-[width] duration-300 md:flex ${
        open ? "w-64" : "w-[72px]"
      }`}
    >
      <Link to="/" className="flex items-center gap-2.5 border-b border-[#e2d5c3] px-4 py-4">
        <span className="grid h-9 w-9 shrink-0 place-content-center rounded-xl bg-[#e76f2e]">
          <span className="font-display text-base font-black leading-none text-white">P</span>
        </span>
        {open && (
          <span className="font-display text-xl font-black tracking-tight text-[#002089]">PAPOT</span>
        )}
      </Link>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={open ? undefined : label}
            className={({ isActive }) =>
              // Soft highlight, not an aggressive solid block (§1)
              `flex h-11 items-center rounded-xl transition-colors ${
                isActive
                  ? "bg-[#EAF8FF] font-semibold text-[#002089]"
                  : "text-[#7a6355] hover:bg-[#F5E9D8] hover:text-[#002089]"
              }`
            }
          >
            <span className="grid h-full w-[56px] shrink-0 place-content-center">
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            {open && <span className="truncate pr-3 text-sm">{label}</span>}
          </NavLink>
        ))}
      </div>

      <div className="space-y-1 border-t border-[#e2d5c3] p-2">
        {[
          { to: "/compte/parametres", label: "Paramètres", Icon: Settings },
          { to: "/compte/aide", label: "Centre d'aide", Icon: HelpCircle },
        ].map(({ to, label, Icon }) => (
          <NavLink
            key={label}
            to={to}
            title={open ? undefined : label}
            className="flex h-10 items-center rounded-xl text-[#7a6355] transition-colors hover:bg-[#F5E9D8] hover:text-[#002089]"
          >
            <span className="grid h-full w-[56px] shrink-0 place-content-center">
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            {open && <span className="truncate pr-3 text-sm">{label}</span>}
          </NavLink>
        ))}
        <button
          onClick={signOut}
          title={open ? undefined : "Se déconnecter"}
          className="flex h-10 w-full items-center rounded-xl text-[#7a6355] transition-colors hover:bg-red-50 hover:text-[#b3261e]"
        >
          <span className="grid h-full w-[56px] shrink-0 place-content-center">
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </span>
          {open && <span className="truncate pr-3 text-sm">Se déconnecter</span>}
        </button>

        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? "Réduire le menu" : "Agrandir le menu"}
          className="flex h-10 w-full items-center rounded-xl text-[#7a6355] transition-colors hover:bg-[#F5E9D8]"
        >
          <span className="grid h-full w-[56px] shrink-0 place-content-center">
            <ChevronsRight
              className={`h-[18px] w-[18px] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
          {open && <span className="text-sm">Réduire</span>}
        </button>
      </div>
    </nav>
  );
}

function PanelHeader() {
  const { user } = useAuth();
  const email = user?.email ?? "";

  return (
    <header className="sticky top-0 z-30 border-b border-[#e2d5c3] bg-[#FBF7F0]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 lg:px-8">
        <Link
          to="/compte/recherche"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border-2 border-[#e2d5c3] bg-white px-3.5 py-2.5 text-sm text-[#b0a090] transition-colors hover:border-[#6ad7fb]"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Rechercher un séjour, une voiture, une table…</span>
        </Link>

        <Link
          to="/compte/notifications"
          aria-label="Notifications"
          className="relative grid h-10 w-10 shrink-0 place-content-center rounded-xl border border-[#e2d5c3] bg-white text-[#7a6355] transition-colors hover:text-[#002089]"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
        </Link>

        <Link
          to="/compte/profil"
          aria-label="Profil"
          className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-[#002089] text-sm font-bold text-white"
        >
          {(email[0] ?? "?").toUpperCase()}
        </Link>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e2d5c3] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex items-stretch">
        {MOBILE_NAV.map(({ to, label, Icon, end }) => {
          const active = end ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              // 56px min target keeps taps comfortable (§52)
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors ${
                active ? "text-[#002089]" : "text-[#7a6355]"
              }`}
            >
              <Icon className={`h-[20px] w-[20px] ${active ? "stroke-[2.4]" : ""}`} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Shared page heading (§45 PageHeader). */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#002089] lg:text-[32px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-[#7a6355]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export { BedDouble };
