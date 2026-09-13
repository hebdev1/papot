import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Search, Settings, UserCog } from "lucide-react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL, useAdmin } from "../lib/adminAuth";
import { adminRpc,useDebounced } from "../lib/adminData";
import { avatarTint, initials } from "../lib/format";
import type { BadgeCounts } from "../lib/nav";

type SearchHit = { group_name: string; id: string; title: string; subtitle: string | null; href: string };

/**
 * The top bar: global search, the alert bell, and the account menu (spec §65).
 * Search runs in Postgres across six entity types (admin_global_search), so an
 * operator can paste a booking reference or a customer email and land on it.
 */
export function AdminHeader({
  onOpenPalette,
  counts,
}: {
  onOpenPalette: () => void;
  counts?: BadgeCounts;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-admin-line bg-admin-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Link to="/admin" className="lg:hidden">
        <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#002089] font-display text-[13px] font-bold text-white">
          P
        </span>
      </Link>

      <GlobalSearch onOpenPalette={onOpenPalette} />

      <div className="ml-auto flex items-center gap-1.5">
        <AlertBell counts={counts} />
        <AccountMenu />
      </div>
    </header>
  );
}

function GlobalSearch({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(term, 250);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    void adminRpc("admin_global_search", { q: debounced }).then(({ data }) => {
      if (!cancelled) {
        setHits((data ?? []) as SearchHit[]);
        setActive(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Keyboard navigation (spec §56).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(a => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) {
        navigate(hit.href);
        setOpen(false);
        setTerm("");
      }
    }
  };

  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.group_name] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div className="relative min-w-0 max-w-xl flex-1" ref={ref}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-ink-3"
        aria-hidden
      />
      <input
        value={term}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Rechercher clients, partenaires, annonces, réservations…"
        aria-label="Recherche globale"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        className="h-9 w-full rounded-lg border border-admin-line bg-admin-canvas pl-9 pr-16 text-[13px] text-admin-ink placeholder:text-admin-ink-3 focus:border-[#002089] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6ad7fb]/40"
      />
      <button
        onClick={onOpenPalette}
        title="Palette de commandes"
        className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-admin-line-strong bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-admin-ink-3 transition-colors hover:text-admin-ink sm:flex"
      >
        ⌘K
      </button>

      {open && term.trim().length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-admin-line bg-white py-1.5 shadow-xl"
        >
          {hits.length === 0 ? (
            <p className="px-4 py-4 text-center text-[13px] text-admin-ink-3">
              Aucun résultat pour « {term} ».
            </p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-3.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-admin-ink-3">
                  {group}
                </p>
                {items.map(h => {
                  const idx = hits.indexOf(h);
                  return (
                    <button
                      key={`${group}-${h.id}`}
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        navigate(h.href);
                        setOpen(false);
                        setTerm("");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors",
                        idx === active ? "bg-[#eef3fb]" : "hover:bg-admin-canvas",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-admin-ink">{h.title}</span>
                        {h.subtitle && (
                          <span className="block truncate text-[12px] text-admin-ink-3">{h.subtitle}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Spec §68: the bell groups by area and leads with severity. */
function AlertBell({ counts }: { counts?: BadgeCounts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const groups: { group: string; items: { label: string; n: number; to: string; severity: string }[] }[] = [
    {
      group: "Approbations",
      items: [
        {
          label: "partenaires en attente de vérification",
          n: Number(counts?.pending_partner_approvals ?? 0),
          to: "/admin/verification",
          severity: "attention",
        },
        {
          label: "annonces à examiner",
          n: Number(counts?.pending_listing_reviews ?? 0),
          to: "/admin/annonces?status=pending_review",
          severity: "attention",
        },
      ],
    },
    {
      group: "Paiements",
      items: [
        {
          label: "paiements en échec ou contestés",
          n: Number(counts?.payment_issues ?? 0),
          to: "/admin/paiements?status=failed",
          severity: "urgent",
        },
        {
          label: "demandes de remboursement",
          n: Number(counts?.refund_requests ?? 0),
          to: "/admin/remboursements",
          severity: "attention",
        },
      ],
    },
    {
      group: "Support",
      items: [
        {
          label: "tickets ouverts",
          n: Number(counts?.support_tickets ?? 0),
          to: "/admin/support",
          severity: "info",
        },
        {
          label: "litiges ouverts",
          n: Number(counts?.open_disputes ?? 0),
          to: "/admin/litiges",
          severity: "urgent",
        },
      ],
    },
  ];

  const total = groups.reduce((n, g) => n + g.items.reduce((m, i) => m + i.n, 0), 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={total > 0 ? `${total} alertes` : "Alertes"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-admin-ink-2 transition-colors hover:bg-admin-canvas hover:text-admin-ink"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {total > 0 && (
          <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-[#e76f2e] px-1 text-[10px] font-bold leading-4 text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-admin-line bg-white shadow-xl">
          <div className="border-b border-admin-line px-4 py-3">
            <p className="font-display text-[14px] font-semibold text-admin-ink">Alertes</p>
            <p className="text-[12px] text-admin-ink-3">
              {total === 0 ? "Rien ne requiert votre attention." : `${total} élément${total > 1 ? "s" : ""} à traiter`}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {groups.map(g => {
              const items = g.items.filter(i => i.n > 0);
              if (items.length === 0) return null;
              return (
                <div key={g.group} className="mb-1">
                  <p className="px-4 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-admin-ink-3">
                    {g.group}
                  </p>
                  {items.map(i => (
                    <Link
                      key={i.label}
                      to={i.to}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-admin-canvas"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          i.severity === "urgent" ? "bg-[#b3261e]" : i.severity === "attention" ? "bg-amber-500" : "bg-[#002089]",
                        )}
                        aria-hidden
                      />
                      <span className="text-[13px] text-admin-ink">
                        <strong className="font-semibold">{i.n}</strong> {i.label}
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
            {total === 0 && (
              <p className="px-4 py-6 text-center text-[13px] text-admin-ink-3">
                Vous êtes à jour.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { me } = useAdmin();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-admin-canvas"
      >
        <span
          className="grid h-7 w-7 place-content-center rounded-full text-[11px] font-bold text-white"
          style={{ background: avatarTint(me?.full_name) }}
          aria-hidden
        >
          {initials(me?.full_name)}
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-admin-ink-3 sm:block" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-admin-line bg-white shadow-xl">
          <div className="border-b border-admin-line px-4 py-3">
            <p className="truncate text-[13px] font-semibold text-admin-ink">{me?.full_name}</p>
            <p className="truncate text-[12px] text-admin-ink-3">{me?.email}</p>
            <p className="mt-1 inline-block rounded bg-[#eef3fb] px-1.5 py-0.5 text-[11px] font-semibold text-[#002089]">
              {me?.role ? ROLE_LABEL[me.role] : ""}
            </p>
          </div>
          <div className="py-1">
            <Link
              to="/admin/profil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-admin-ink hover:bg-admin-canvas"
            >
              <UserCog className="h-4 w-4" aria-hidden />
              Mon profil
            </Link>
            <Link
              to="/admin/parametres"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-admin-ink hover:bg-admin-canvas"
            >
              <Settings className="h-4 w-4" aria-hidden />
              Paramètres
            </Link>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 border-t border-admin-line px-4 py-2.5 text-[13px] font-medium text-[#b3261e] hover:bg-[#fdf3f2]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
