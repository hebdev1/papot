import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronsRight,
  Command,
  ExternalLink,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";
import { useAdmin, ROLE_LABEL, useRecordAdminLogin } from "../lib/adminAuth";
import { useRpc } from "../lib/adminData";
import {
  FOOTER_ITEMS,
  MOBILE_MORE,
  MOBILE_TABS,
  NAV_GROUPS,
  OVERVIEW,
  type BadgeCounts,
  type NavItem,
} from "../lib/nav";
import { avatarTint, initials } from "../../console/format";
import { AdminHeader } from "./AdminHeader";
import { CommandPalette } from "./CommandPalette";

/**
 * The console shell (spec §65).
 *
 * Desktop: a collapsible sidebar whose state persists, so an operator who works
 * in the icon rail keeps it between sessions.
 * Tablet: the same sidebar, collapsed to a rail by default.
 * Mobile: no sidebar at all — a five-item tab bar plus a "Plus" sheet (§2),
 * because a 12-group tree does not shrink into 390px.
 */

const OPEN_KEY = "papot.admin.sidebar.open";
const GROUPS_KEY = "papot.admin.sidebar.groups";

export function AdminLayout() {
  const { me, can, canAny } = useAdmin();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useRecordAdminLogin(!!me?.is_staff);

  // Health counts drive the sidebar badges, refreshed with the overview.
  const { data: overview } = useRpc<{ health: BadgeCounts }>("admin_overview");
  const counts = overview?.health;

  // ⌘K / Ctrl+K (spec §57).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile sheet on navigation.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen w-full bg-admin-canvas text-admin-ink">
      <Sidebar counts={counts} canAny={canAny} can={can} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onOpenPalette={() => setPaletteOpen(true)} counts={counts} />

        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav onMore={() => setMoreOpen(true)} can={can} />
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} can={can} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function Sidebar({
  counts,
  canAny,
  can,
}: {
  counts?: BadgeCounts;
  canAny: (p: string[]) => boolean;
  can: (p: string) => boolean;
}) {
  const { me } = useAdmin();
  const { signOut } = useAuth();
  const location = useLocation();

  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "false");
  const [expanded, setExpanded] = useState<string[]>(() => {
    const saved = localStorage.getItem(GROUPS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as string[];
      } catch {
        /* fall through */
      }
    }
    return ["users", "listings", "reservations"];
  });

  useEffect(() => localStorage.setItem(OPEN_KEY, String(open)), [open]);
  useEffect(() => localStorage.setItem(GROUPS_KEY, JSON.stringify(expanded)), [expanded]);

  const toggleGroup = (id: string) =>
    setExpanded(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]));

  const groups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => !i.permission || can(i.permission)),
  })).filter(g => g.items.length > 0);

  return (
    <nav
      aria-label="Navigation de l'administration"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-admin-line bg-admin-surface transition-[width] duration-300 ease-out lg:flex",
        open ? "w-[248px]" : "w-[68px]",
      )}
    >
      {/* Brand */}
      <div className="border-b border-admin-line p-2.5">
        <Link
          to="/admin"
          className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-admin-canvas"
        >
          <span className="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-[#002089] font-display text-[15px] font-bold text-white">
            P
          </span>
          {open && (
            <span className="min-w-0">
              <span className="block truncate font-display text-[14px] font-semibold text-admin-ink">
                PAPOT
              </span>
              <span className="block truncate text-[11.5px] text-admin-ink-3">Console d'administration</span>
            </span>
          )}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:thin]">
        <SidebarLink item={OVERVIEW} open={open} exact />

        {groups.map(g => {
          const isExpanded = expanded.includes(g.id);
          const hasActive = g.items.some(i => location.pathname.startsWith(i.match ?? i.to.split("?")[0]));
          const groupTotal = g.items.reduce(
            (n, i) => n + (i.badge && counts ? Number(counts[i.badge] ?? 0) : 0),
            0,
          );

          if (!open) {
            // Collapsed rail: the group icon links to its first screen.
            return (
              <div key={g.id} className="mt-1">
                <SidebarLink
                  item={{ label: g.label, to: g.items[0].to, icon: g.icon }}
                  open={false}
                  badgeCount={groupTotal}
                />
              </div>
            );
          }

          return (
            <div key={g.id} className="mt-3">
              <button
                onClick={() => toggleGroup(g.id)}
                aria-expanded={isExpanded}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                  hasActive ? "text-[#002089]" : "text-admin-ink-3 hover:text-admin-ink",
                )}
              >
                <span className="flex items-center gap-2">
                  {g.label}
                  {groupTotal > 0 && !isExpanded && (
                    <span className="rounded-full bg-[#e76f2e] px-1.5 text-[10px] font-bold leading-4 text-white">
                      {groupTotal}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")}
                  aria-hidden
                />
              </button>

              {isExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  {g.items.map(i => (
                    <SidebarLink
                      key={i.to}
                      item={i}
                      open={open}
                      badgeCount={i.badge && counts ? Number(counts[i.badge] ?? 0) : 0}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Account block */}
      <div className="border-t border-admin-line p-2">
        {open ? (
          <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span
              className="grid h-8 w-8 shrink-0 place-content-center rounded-full text-[12px] font-bold text-white"
              style={{ background: avatarTint(me?.full_name) }}
              aria-hidden
            >
              {initials(me?.full_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-admin-ink">
                {me?.full_name ?? "Administrateur"}
              </span>
              <span className="block truncate text-[11.5px] text-admin-ink-3">
                {me?.role ? ROLE_LABEL[me.role] : ""}
              </span>
            </span>
          </div>
        ) : (
          <div className="mb-1 flex justify-center py-1">
            <span
              className="grid h-8 w-8 place-content-center rounded-full text-[12px] font-bold text-white"
              style={{ background: avatarTint(me?.full_name) }}
              title={me?.full_name ?? ""}
            >
              {initials(me?.full_name)}
            </span>
          </div>
        )}

        {FOOTER_ITEMS.map(i => (
          <SidebarLink key={i.to} item={i} open={open} small />
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

function SidebarLink({
  item,
  open,
  badgeCount = 0,
  exact,
  small,
}: {
  item: NavItem;
  open: boolean;
  badgeCount?: number;
  exact?: boolean;
  small?: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={exact}
      title={open ? undefined : item.label}
      className={({ isActive }) =>
        cn(
          "relative flex items-center rounded-md text-[13px] font-medium transition-colors",
          small ? "h-9" : "h-9",
          open ? "px-2.5" : "justify-center",
          isActive
            ? "bg-[#eef3fb] text-[#002089] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-[#002089]"
            : "text-admin-ink-2 hover:bg-admin-canvas hover:text-admin-ink",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {open && <span className="ml-2.5 min-w-0 flex-1 truncate">{item.label}</span>}
      {badgeCount > 0 &&
        (open ? (
          <span className="ml-auto rounded-full bg-[#e76f2e] px-1.5 text-[10.5px] font-bold leading-[18px] text-white">
            {badgeCount}
          </span>
        ) : (
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#e76f2e]" aria-hidden />
        ))}
    </NavLink>
  );
}

/** Spec §2: five destinations, 56px targets, never a shrunken sidebar. */
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
          end={t.to === "/admin"}
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
  const items = MOBILE_MORE.filter(i => !i.permission || can(i.permission));
  const { signOut } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:hidden">
      <div className="absolute inset-0 bg-[#101828]/45" onClick={onClose} aria-hidden />
      <div className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-admin-line bg-white px-4 py-3.5">
          <h2 className="font-display text-[15px] font-semibold text-admin-ink">Toutes les sections</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-admin-ink-3">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

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
          {FOOTER_ITEMS.map(i => (
            <Link
              key={i.to}
              to={i.to}
              className="flex min-h-[52px] items-center gap-2.5 rounded-xl px-3 text-[13.5px] font-medium text-admin-ink-2"
            >
              <i.icon className="h-4 w-4" aria-hidden />
              {i.label}
            </Link>
          ))}
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

/** Shown while the role is loading, so the console never flashes empty nav. */
export function AdminBooting() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-canvas">
      <div className="flex flex-col items-center gap-3">
        <span className="grid h-11 w-11 place-content-center rounded-xl bg-[#002089] font-display text-lg font-bold text-white">
          P
        </span>
        <p className="text-[13px] text-admin-ink-3">Chargement de la console…</p>
      </div>
    </div>
  );
}

export { Gauge, LayoutGrid, Command };
