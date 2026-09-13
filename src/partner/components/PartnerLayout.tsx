import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BedDouble,
  Building2,
  Car,
  Check,
  ChevronDown,
  ChevronsRight,
  ExternalLink,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";
import { avatarTint, initials } from "../../console/format";
import { ROLE_LABEL, TYPE_LABEL, usePartner } from "../lib/partnerAuth";
import { FOOTER_ITEMS, MOBILE_MORE, MOBILE_TABS, OVERVIEW, visibleGroups, type NavItem } from "../lib/nav";
import { PartnerHeader } from "./PartnerHeader";

/**
 * The partner shell (spec §3, §4).
 *
 * Desktop: a collapsible sidebar whose state persists. Mobile: no sidebar at
 * all — a five-item tab bar plus a "Plus" sheet, because a nine-group tree does
 * not shrink into 390px.
 *
 * The sidebar tree is filtered twice: by the role's permissions, and by the
 * business type. A restaurant never sees "Chambres"; a car rental never sees
 * "Menu". That is what keeps this from feeling like an ERP.
 */

const OPEN_KEY = "papot.partner.sidebar.open";
const GROUPS_KEY = "papot.partner.sidebar.groups";

export function PartnerLayout() {
  const { can, active } = usePartner();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen w-full bg-admin-canvas text-admin-ink">
      <Sidebar can={can} />

      <div className="flex min-w-0 flex-1 flex-col">
        <PartnerHeader />

        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav onMore={() => setMoreOpen(true)} can={can} />
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} can={can} />}
      {!active && null}
    </div>
  );
}

function Sidebar({ can }: { can: (p: string) => boolean }) {
  const { active } = usePartner();
  const { signOut } = useAuth();
  const location = useLocation();

  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "false");
  const [expanded, setExpanded] = useState<string[]>(() => {
    const saved = localStorage.getItem(GROUPS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as string[];
      } catch {
        /* fall through to defaults */
      }
    }
    return ["listings", "reservations"];
  });

  useEffect(() => localStorage.setItem(OPEN_KEY, String(open)), [open]);
  useEffect(() => localStorage.setItem(GROUPS_KEY, JSON.stringify(expanded)), [expanded]);

  const groups = visibleGroups(active?.type, can);

  return (
    <nav
      aria-label="Navigation partenaire"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-admin-line bg-admin-surface transition-[width] duration-300 ease-out lg:flex",
        open ? "w-[248px]" : "w-[68px]",
      )}
    >
      <BusinessSwitcher open={open} />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:thin]">
        <SidebarLink item={OVERVIEW} open={open} exact />

        {groups.map(g => {
          const isExpanded = expanded.includes(g.id);
          const hasActive = g.items.some(i =>
            location.pathname.startsWith(i.match ?? i.to.split("?")[0]),
          );

          if (!open) {
            return (
              <div key={g.id} className="mt-1">
                <SidebarLink item={{ label: g.label, to: g.items[0].to, icon: g.icon }} open={false} />
              </div>
            );
          }

          return (
            <div key={g.id} className="mt-3">
              <button
                onClick={() =>
                  setExpanded(e => (e.includes(g.id) ? e.filter(x => x !== g.id) : [...e, g.id]))
                }
                aria-expanded={isExpanded}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                  hasActive ? "text-[#002089]" : "text-admin-ink-3 hover:text-admin-ink",
                )}
              >
                {g.label}
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")}
                  aria-hidden
                />
              </button>

              {isExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  {g.items.map(i => (
                    <SidebarLink key={i.to} item={i} open={open} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-admin-line p-2">
        {FOOTER_ITEMS.map(i => (
          <SidebarLink key={i.to} item={i} open={open} />
        ))}

        <a
          href="/"
          className={cn(
            "flex h-9 items-center rounded-md text-[13px] font-medium text-admin-ink-2 transition-colors hover:bg-admin-canvas hover:text-admin-ink",
            open ? "px-2.5" : "justify-center",
          )}
          title="Voir le site"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          {open && <span className="ml-2.5">Voir le site</span>}
        </a>

        <button
          onClick={() => void signOut()}
          className={cn(
            "flex h-9 w-full items-center rounded-md text-[13px] font-medium text-admin-ink-2 transition-colors hover:bg-[#fdf3f2] hover:text-[#b3261e]",
            open ? "px-2.5" : "justify-center",
          )}
          title="Se déconnecter"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          {open && <span className="ml-2.5">Se déconnecter</span>}
        </button>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Réduire le menu" : "Déplier le menu"}
        className="flex h-11 items-center border-t border-admin-line text-admin-ink-3 transition-colors hover:bg-admin-canvas hover:text-admin-ink"
      >
        <span className="grid w-[68px] shrink-0 place-content-center">
          <ChevronsRight
            className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")}
            aria-hidden
          />
        </span>
        {open && <span className="text-[13px] font-medium">Réduire</span>}
      </button>
    </nav>
  );
}

const TYPE_ICON = {
  hotel: Building2,
  guesthouse: BedDouble,
  car: Car,
  restaurant: UtensilsCrossed,
} as const;

/**
 * Switches between businesses (spec §3).
 *
 * Someone who manages two properties must never wonder which one they are
 * editing, so the current business is the most prominent thing in the sidebar.
 */
function BusinessSwitcher({ open }: { open: boolean }) {
  const { memberships, active, setActive } = usePartner();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const Icon = active ? TYPE_ICON[active.type] : Building2;
  const many = memberships.length > 1;

  return (
    <div className="relative border-b border-admin-line p-2.5" ref={ref}>
      <button
        onClick={() => many && setMenuOpen(o => !o)}
        aria-haspopup={many ? "listbox" : undefined}
        aria-expanded={many ? menuOpen : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors",
          many && "hover:bg-admin-canvas",
        )}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-content-center rounded-lg text-white"
          style={{ background: avatarTint(active?.business_name ?? "PAPOT") }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {open && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[14px] font-semibold text-admin-ink">
                {active?.business_name ?? "PAPOT"}
              </span>
              <span className="block truncate text-[11.5px] text-admin-ink-3">
                {active ? TYPE_LABEL[active.type] : "Espace partenaire"}
              </span>
            </span>
            {many && <ChevronDown className="h-4 w-4 shrink-0 text-admin-ink-3" aria-hidden />}
          </>
        )}
      </button>

      {menuOpen && open && (
        <div
          role="listbox"
          className="absolute inset-x-2.5 top-[68px] z-40 overflow-hidden rounded-lg border border-admin-line bg-white py-1 shadow-lg"
        >
          {memberships.map(m => {
            const MIcon = TYPE_ICON[m.type];
            const on = m.partner_id === active?.partner_id;
            return (
              <button
                key={m.partner_id}
                role="option"
                aria-selected={on}
                onClick={() => {
                  setActive(m.partner_id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-admin-canvas"
              >
                <MIcon className="h-4 w-4 shrink-0 text-admin-ink-3" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-admin-ink">
                    {m.business_name}
                  </span>
                  <span className="block truncate text-[11.5px] text-admin-ink-3">
                    {ROLE_LABEL[m.role]}
                  </span>
                </span>
                {on && <Check className="h-3.5 w-3.5 shrink-0 text-[#002089]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  item,
  open,
  exact,
}: {
  item: NavItem;
  open: boolean;
  exact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={exact}
      title={open ? undefined : item.label}
      className={({ isActive }) =>
        cn(
          "relative flex h-9 items-center rounded-md text-[13px] font-medium transition-colors",
          open ? "px-2.5" : "justify-center",
          isActive
            ? "bg-[#eef3fb] text-[#002089] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-[#002089]"
            : "text-admin-ink-2 hover:bg-admin-canvas hover:text-admin-ink",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {open && <span className="ml-2.5 min-w-0 flex-1 truncate">{item.label}</span>}
    </NavLink>
  );
}

/** Spec §68: what "+ Create" offers depends on the business. */
export function QuickCreate() {
  const { active, can } = usePartner();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!active || !can("manage_listings")) return null;

  const options: { label: string; to: string }[] =
    active.type === "car"
      ? [
          { label: "Nouveau véhicule", to: "/partenaire/annonces/nouveau" },
          { label: "Lieu de prise en charge", to: "/partenaire/lieux" },
        ]
      : active.type === "restaurant"
        ? [
            { label: "Article de menu", to: "/partenaire/menu" },
            { label: "Table", to: "/partenaire/tables" },
          ]
        : [
            { label: "Nouvelle annonce", to: "/partenaire/annonces/nouveau" },
            { label: "Nouvelle chambre", to: "/partenaire/chambres" },
          ];

  if (can("manage_promotions")) options.push({ label: "Promotion", to: "/partenaire/promotions" });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#002089] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#001b6e]"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Créer</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-lg border border-admin-line bg-white py-1 shadow-lg">
          {options.map(o => (
            <button
              key={o.label}
              onClick={() => {
                setOpen(false);
                navigate(o.to);
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-admin-ink transition-colors hover:bg-admin-canvas"
            >
              {o.label === "Promotion" ? (
                <Sparkles className="h-3.5 w-3.5 text-admin-ink-3" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5 text-admin-ink-3" aria-hidden />
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNav({ onMore, can }: { onMore: () => void; can: (p: string) => boolean }) {
  const tabs = MOBILE_TABS.filter(t => !t.permission || can(t.permission));

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-admin-line bg-admin-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/partenaire"}
          className={({ isActive }) =>
            cn(
              "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors",
              isActive ? "text-[#002089]" : "text-admin-ink-3",
            )
          }
        >
          <t.icon className="h-[18px] w-[18px]" aria-hidden />
          {t.label}
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-admin-ink-3"
      >
        <Menu className="h-[18px] w-[18px]" aria-hidden />
        Plus
      </button>
    </nav>
  );
}

function MoreSheet({ onClose, can }: { onClose: () => void; can: (p: string) => boolean }) {
  const { active, memberships, setActive } = usePartner();
  const { signOut } = useAuth();
  const items = MOBILE_MORE.filter(i => !i.permission || can(i.permission));

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:hidden">
      <div className="absolute inset-0 bg-[#101828]/45" onClick={onClose} aria-hidden />
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-admin-line bg-white px-4 py-3.5">
          <h2 className="font-display text-[15px] font-semibold text-admin-ink">
            {active?.business_name ?? "Mon espace"}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-admin-ink-3">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {memberships.length > 1 && (
          <div className="border-b border-admin-line p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">
              Changer d'établissement
            </p>
            <div className="flex flex-col gap-1">
              {memberships.map(m => (
                <button
                  key={m.partner_id}
                  onClick={() => {
                    setActive(m.partner_id);
                    onClose();
                  }}
                  className={cn(
                    "flex min-h-[48px] items-center justify-between rounded-xl px-3 text-[13.5px] font-medium",
                    m.partner_id === active?.partner_id
                      ? "bg-[#eef3fb] text-[#002089]"
                      : "text-admin-ink",
                  )}
                >
                  {m.business_name}
                  {m.partner_id === active?.partner_id && <Check className="h-4 w-4" aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 p-3">
          {items.map(i => (
            <Link
              key={i.to}
              to={i.to}
              className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-admin-line px-3 py-3 text-[13.5px] font-medium text-admin-ink transition-colors active:bg-admin-canvas"
            >
              <i.icon className="h-4 w-4 shrink-0 text-[#002089]" aria-hidden />
              {i.label}
            </Link>
          ))}
        </div>

        <div className="border-t border-admin-line p-3">
          <Link
            to="/partenaire/support"
            className="flex min-h-[52px] items-center gap-2.5 rounded-xl px-3 text-[13.5px] font-medium text-admin-ink-2"
          >
            <LifeBuoy className="h-4 w-4" aria-hidden />
            Support
          </Link>
          <button
            onClick={() => void signOut()}
            className="flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-3 text-[13.5px] font-medium text-[#b3261e]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

export { initials };
