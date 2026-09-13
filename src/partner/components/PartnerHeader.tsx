import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Search, Settings, UserCog } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";
import { avatarTint, initials } from "../../console/format";
import { useDebounced, useRpc, rpc } from "../../console/data";
import { ROLE_LABEL, usePartner } from "../lib/partnerAuth";
import { QuickCreate } from "./PartnerLayout";

type Hit = { group_name: string; id: string; title: string; subtitle: string | null; href: string };

/** Top bar: search their own business, alerts, quick create, account (spec §3, §66). */
export function PartnerHeader() {
  const { active } = usePartner();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-admin-line bg-admin-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Link to="/partenaire" className="lg:hidden">
        <span
          className="grid h-8 w-8 place-content-center rounded-lg font-display text-[13px] font-bold text-white"
          style={{ background: avatarTint(active?.business_name ?? "PAPOT") }}
        >
          {initials(active?.business_name ?? "P")}
        </span>
      </Link>

      <BusinessSearch />

      <div className="ml-auto flex items-center gap-1.5">
        <QuickCreate />
        <AlertBell />
        <AccountMenu />
      </div>
    </header>
  );
}

function BusinessSearch() {
  const { active } = usePartner();
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(term, 250);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.trim().length < 2 || !active) {
      setHits([]);
      return;
    }
    let cancelled = false;
    void rpc("partner_search", { p_partner: active.partner_id, q: debounced }).then(({ data }) => {
      if (!cancelled) setHits((data ?? []) as Hit[]);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, active]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const grouped = hits.reduce<Record<string, Hit[]>>((acc, h) => {
    (acc[h.group_name] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div className="relative min-w-0 max-w-md flex-1" ref={ref}>
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
        placeholder="Rechercher dans votre établissement…"
        aria-label="Rechercher"
        className="h-9 w-full rounded-lg border border-admin-line bg-admin-canvas pl-9 pr-3 text-[13px] text-admin-ink placeholder:text-admin-ink-3 focus:border-[#002089] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6ad7fb]/40"
      />

      {open && term.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-admin-line bg-white py-1.5 shadow-xl">
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
                {items.map(h => (
                  <button
                    key={`${group}-${h.id}`}
                    onClick={() => {
                      navigate(h.href);
                      setOpen(false);
                      setTerm("");
                    }}
                    className="flex w-full flex-col items-start px-3.5 py-2 text-left transition-colors hover:bg-admin-canvas"
                  >
                    <span className="truncate text-[13px] font-medium text-admin-ink">{h.title}</span>
                    {h.subtitle && (
                      <span className="truncate text-[12px] text-admin-ink-3">{h.subtitle}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type Overview = {
  action_required: {
    pending_confirmation: number;
    listings_need_changes: number;
    unread_messages: number;
    unanswered_reviews: number;
  };
};

/** Spec §65: what needs the partner, grouped and led by urgency. */
function AlertBell() {
  const { active } = usePartner();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useRpc<Overview>(
    "partner_overview",
    { p_partner: active?.partner_id },
    !!active,
  );
  const a = data?.action_required;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items = [
    { n: Number(a?.pending_confirmation ?? 0), label: "réservations à confirmer", to: "/partenaire/reservations?status=pending", urgent: true },
    { n: Number(a?.listings_need_changes ?? 0), label: "annonces à corriger", to: "/partenaire/annonces?status=rejected", urgent: true },
    { n: Number(a?.unread_messages ?? 0), label: "conversations clients", to: "/partenaire/messages", urgent: false },
    { n: Number(a?.unanswered_reviews ?? 0), label: "avis sans réponse", to: "/partenaire/avis", urgent: false },
  ].filter(i => i.n > 0);

  const total = items.reduce((n, i) => n + i.n, 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={total > 0 ? `${total} éléments à traiter` : "Notifications"}
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
            <p className="font-display text-[14px] font-semibold text-admin-ink">À traiter</p>
            <p className="text-[12px] text-admin-ink-3">
              {total === 0 ? "Rien ne vous attend." : `${total} élément${total > 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-admin-ink-3">Vous êtes à jour.</p>
            ) : (
              items.map(i => (
                <Link
                  key={i.label}
                  to={i.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-admin-canvas"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      i.urgent ? "bg-[#e76f2e]" : "bg-[#002089]",
                    )}
                    aria-hidden
                  />
                  <span className="text-[13px] text-admin-ink">
                    <strong className="font-semibold">{i.n}</strong> {i.label}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { active } = usePartner();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const label = user?.email ?? "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-admin-canvas"
      >
        <span
          className="grid h-7 w-7 place-content-center rounded-full text-[11px] font-bold text-white"
          style={{ background: avatarTint(label) }}
          aria-hidden
        >
          {initials(label)}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-admin-line bg-white shadow-xl"
        >
          <div className="border-b border-admin-line px-4 py-3">
            <p className="truncate text-[13px] font-semibold text-admin-ink">{label}</p>
            {active && (
              <p className="mt-1 inline-block rounded bg-[#eef3fb] px-1.5 py-0.5 text-[11px] font-semibold text-[#002089]">
                {ROLE_LABEL[active.role]}
              </p>
            )}
          </div>
          <div className="py-1">
            <Link
              to="/partenaire/reglages/compte"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-admin-ink hover:bg-admin-canvas"
            >
              <UserCog className="h-4 w-4" aria-hidden />
              Mon compte
            </Link>
            <Link
              to="/partenaire/reglages/reservation"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-admin-ink hover:bg-admin-canvas"
            >
              <Settings className="h-4 w-4" aria-hidden />
              Réglages
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
